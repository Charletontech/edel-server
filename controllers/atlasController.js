const https = require("https");
const crypto = require("crypto");
const { User, Transaction, AtlasCheckout } = require("../models");
const { getPlatformSettingValue } = require("../utils/platformSettings");

const ATLAS_API_KEY = process.env.ATLAS_API_KEY;
const ATLAS_BASE_URL =
  process.env.ATLAS_BASE_URL || "https://atlas.tryduplo.com";
const ATLAS_VERIFY_PATH_TEMPLATE =
  process.env.ATLAS_VERIFY_PATH_TEMPLATE ||
  "/api/v1/checkout/verify/{reference}";
// const ATLAS_VERIFY_PATH_TEMPLATE =
// process.env.ATLAS_VERIFY_PATH_TEMPLATE + reference;

function atlasRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    if (!ATLAS_API_KEY) {
      reject(new Error("Atlas API key is not configured"));
      return;
    }

    const url = new URL(path, ATLAS_BASE_URL);
    const payload = body ? JSON.stringify(body) : null;

    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          Authorization: `Bearer ${ATLAS_API_KEY}`,
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        timeout: 30000,
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          let parsed = null;
          try {
            parsed = data ? JSON.parse(data) : null;
          } catch (error) {
            reject(new Error("Atlas returned an invalid response"));
            return;
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
            return;
          }

          const message =
            parsed?.message ||
            `Atlas request failed with status ${res.statusCode}`;
          const error = new Error(message);
          error.response = parsed;
          error.statusCode = res.statusCode;
          reject(error);
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("Atlas request timed out"));
    });

    req.on("error", reject);

    if (payload) req.write(payload);
    req.end();
  });
}

function generateSourceReference(userId) {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `EDL-A${String(userId).padStart(4, "0")}-${Date.now()}-${random}`;
}

function splitName(fullName = "") {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "E-del",
    lastName: parts.slice(1).join(" ") || "Provider",
  };
}

function normalizeAtlasStatus(response) {
  const data = response?.data || response || {};
  const value = String(
    data.status ||
      data.transactionStatus ||
      data.paymentStatus ||
      data.checkoutStatus ||
      response?.status ||
      "",
  ).toLowerCase();

  if (
    ["success", "successful", "paid", "completed", "confirmed"].includes(value)
  ) {
    return "success";
  }

  if (
    [
      "failed",
      "failure",
      "cancelled",
      "canceled",
      "expired",
      "abandoned",
    ].includes(value)
  ) {
    return "failed";
  }

  return "pending";
}

function buildVerifyPath(reference) {
  return ATLAS_VERIFY_PATH_TEMPLATE.replace(
    "{reference}",
    encodeURIComponent(reference),
  );
}

function isAccessFeeActive(user) {
  return Boolean(
    user.hasPaidAccessFee &&
    user.accessFeeExpiresAt &&
    new Date(user.accessFeeExpiresAt) > new Date(),
  );
}

async function markAccessFeePaid(checkout, verifyResponse) {
  const dbTransaction = await Transaction.sequelize.transaction();

  try {
    const lockedCheckout = await AtlasCheckout.findOne({
      where: { id: checkout.id },
      transaction: dbTransaction,
      lock: dbTransaction.LOCK.UPDATE,
    });

    if (!lockedCheckout) {
      await dbTransaction.rollback();
      throw new Error("Atlas checkout not found");
    }

    const transaction = await Transaction.findByPk(
      lockedCheckout.transactionId,
      {
        transaction: dbTransaction,
        lock: dbTransaction.LOCK.UPDATE,
      },
    );

    if (!transaction) {
      await dbTransaction.rollback();
      throw new Error("Transaction not found");
    }

    if (
      transaction.status === "success" &&
      lockedCheckout.status === "success"
    ) {
      await dbTransaction.rollback();
      return { transaction, checkout: lockedCheckout, alreadyVerified: true };
    }

    transaction.status = "success";
    transaction.paidAt = transaction.paidAt || new Date();
    await transaction.save({ transaction: dbTransaction });

    lockedCheckout.status = "success";
    lockedCheckout.verifiedAt = lockedCheckout.verifiedAt || new Date();
    lockedCheckout.rawVerifyResponse = verifyResponse;
    await lockedCheckout.save({ transaction: dbTransaction });

    const user = await User.findByPk(transaction.userId, {
      transaction: dbTransaction,
      lock: dbTransaction.LOCK.UPDATE,
    });

    if (user) {
      user.hasPaidAccessFee = true;
      const now = new Date();
      let newExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      if (user.accessFeeExpiresAt && new Date(user.accessFeeExpiresAt) > now) {
        newExpiry = new Date(
          new Date(user.accessFeeExpiresAt).getTime() +
            30 * 24 * 60 * 60 * 1000,
        );
      }

      user.accessFeeExpiresAt = newExpiry;
      await user.save({ transaction: dbTransaction });
    }

    await dbTransaction.commit();
    return { transaction, checkout: lockedCheckout, alreadyVerified: false };
  } catch (error) {
    await dbTransaction.rollback();
    throw error;
  }
}

async function markAtlasFailed(checkout, verifyResponse) {
  const dbTransaction = await Transaction.sequelize.transaction();

  try {
    const lockedCheckout = await AtlasCheckout.findByPk(checkout.id, {
      transaction: dbTransaction,
      lock: dbTransaction.LOCK.UPDATE,
    });

    if (!lockedCheckout || lockedCheckout.status !== "pending") {
      await dbTransaction.rollback();
      return;
    }

    const transaction = await Transaction.findByPk(
      lockedCheckout.transactionId,
      {
        transaction: dbTransaction,
        lock: dbTransaction.LOCK.UPDATE,
      },
    );

    lockedCheckout.status = "failed";
    lockedCheckout.rawVerifyResponse = verifyResponse;
    await lockedCheckout.save({ transaction: dbTransaction });

    if (transaction && transaction.status === "pending") {
      transaction.status = "failed";
      await transaction.save({ transaction: dbTransaction });
    }

    await dbTransaction.commit();
  } catch (error) {
    await dbTransaction.rollback();
    throw error;
  }
}

async function verifyCheckout(checkout) {
  const reference = checkout.checkoutReference || checkout.sourceReference;
  const response = await atlasRequest("GET", buildVerifyPath(reference));
  const status = normalizeAtlasStatus(response);
  return { response, status };
}

exports.initiateAccessFeeCheckout = async (req, res, next) => {
  let createdCheckout = null;

  try {
    const dbTransaction = await Transaction.sequelize.transaction();

    try {
      const user = await User.findByPk(req.user.id, {
        transaction: dbTransaction,
        lock: dbTransaction.LOCK.UPDATE,
      });

      if (!user) {
        await dbTransaction.rollback();
        return res.status(404).json({ message: "User not found" });
      }

      if (isAccessFeeActive(user)) {
        await dbTransaction.rollback();
        return res.status(400).json({
          message:
            "You have already paid the access fee and it is currently active.",
        });
      }

      const amount =
        (await getPlatformSettingValue("provider_access_fee_amount")) || 3500;
      const existingCheckout = await AtlasCheckout.findOne({
        where: {
          userId: user.id,
          status: "pending",
        },
        order: [["createdAt", "DESC"]],
        transaction: dbTransaction,
        lock: dbTransaction.LOCK.UPDATE,
      });

      if (existingCheckout?.checkoutUrl) {
        await dbTransaction.commit();
        return res.json({
          checkoutUrl: existingCheckout.checkoutUrl,
          checkoutReference: existingCheckout.checkoutReference,
          sourceReference: existingCheckout.sourceReference,
          amount: Number(existingCheckout.amount),
          currency: existingCheckout.currency,
          reused: true,
        });
      }

      if (existingCheckout && !existingCheckout.checkoutUrl) {
        existingCheckout.status = "failed";
        await existingCheckout.save({ transaction: dbTransaction });

        const existingTransaction = await Transaction.findByPk(
          existingCheckout.transactionId,
          {
            transaction: dbTransaction,
            lock: dbTransaction.LOCK.UPDATE,
          },
        );

        if (existingTransaction && existingTransaction.status === "pending") {
          existingTransaction.status = "failed";
          await existingTransaction.save({ transaction: dbTransaction });
        }
      }

      const sourceReference = generateSourceReference(user.id);
      const transactionRecord = await Transaction.create(
        {
          userId: user.id,
          reference: sourceReference,
          amount,
          currency: "NGN",
          status: "pending",
          description: "Platform Access Fee - Atlas",
        },
        { transaction: dbTransaction },
      );

      createdCheckout = await AtlasCheckout.create(
        {
          userId: user.id,
          transactionId: transactionRecord.id,
          sourceReference,
          amount,
          currency: "NGN",
          status: "pending",
        },
        { transaction: dbTransaction },
      );

      await dbTransaction.commit();
    } catch (error) {
      await dbTransaction.rollback();
      throw error;
    }

    const user = await User.findByPk(req.user.id);
    const { firstName, lastName } = splitName(user.fullName);

    const atlasResponse = await atlasRequest(
      "POST",
      "/api/v1/checkout/initiate",
      {
        currency: "NGN",
        first_name: firstName,
        last_name: lastName,
        email: user.email,
        amount: Number(createdCheckout.amount),
        source_reference: createdCheckout.sourceReference,
        description: "E-del platform access fee",
      },
    );

    const data = atlasResponse?.data || {};
    if (!data.checkoutUrl) {
      throw new Error("Atlas did not return a checkout URL");
    }

    createdCheckout.checkoutUrl = data.checkoutUrl;
    createdCheckout.checkoutReference = data.checkoutReference || null;
    createdCheckout.rawInitiateResponse = atlasResponse;
    await createdCheckout.save();

    res.json({
      checkoutUrl: createdCheckout.checkoutUrl,
      checkoutReference: createdCheckout.checkoutReference,
      sourceReference: createdCheckout.sourceReference,
      amount: Number(createdCheckout.amount),
      currency: createdCheckout.currency,
      reused: false,
    });
  } catch (error) {
    if (createdCheckout && !createdCheckout.checkoutUrl) {
      try {
        await markAtlasFailed(
          createdCheckout,
          error.response || { message: error.message },
        );
      } catch (markError) {
        console.error(
          "[Atlas] Error marking failed checkout:",
          markError.message,
        );
      }
    }
    next(error);
  }
};

exports.verifyAccessFeeCheckout = async (req, res, next) => {
  try {
    const sourceReference = req.params.sourceReference;
    const checkout = await AtlasCheckout.findOne({
      where: {
        sourceReference,
        userId: req.user.id,
      },
    });

    if (!checkout) {
      return res.status(404).json({ message: "Atlas checkout not found" });
    }

    if (checkout.status === "success") {
      return res.json({
        message: "Payment already verified",
        status: checkout.status,
        sourceReference: checkout.sourceReference,
      });
    }

    const { response, status } = await verifyCheckout(checkout);

    if (status === "success") {
      const result = await markAccessFeePaid(checkout, response);
      return res.json({
        message: result.alreadyVerified
          ? "Payment already verified"
          : "Payment verified successfully",
        status: "success",
        sourceReference: checkout.sourceReference,
      });
    }

    if (status === "failed") {
      await markAtlasFailed(checkout, response);
    }

    res.status(400).json({
      message: "Payment verification failed or pending",
      status,
      sourceReference: checkout.sourceReference,
      data: response?.data || response,
    });
  } catch (error) {
    next(error);
  }
};

exports.handleAtlasWebhook = async (req, res, next) => {
  try {
    const sourceReference =
      req.body?.data?.sourceReference ||
      req.body?.data?.source_reference ||
      req.body?.sourceReference ||
      req.body?.source_reference;

    const checkoutReference =
      req.body?.data?.checkoutReference ||
      req.body?.data?.checkout_reference ||
      req.body?.checkoutReference ||
      req.body?.checkout_reference;

    if (!sourceReference && !checkoutReference) {
      return res.status(202).json({ message: "Webhook accepted" });
    }

    const checkout = await AtlasCheckout.findOne({
      where: sourceReference ? { sourceReference } : { checkoutReference },
    });

    if (!checkout || checkout.status === "success") {
      return res.status(202).json({ message: "Webhook accepted" });
    }

    const { response, status } = await verifyCheckout(checkout);

    if (status === "success") {
      await markAccessFeePaid(checkout, response);
    } else if (status === "failed") {
      await markAtlasFailed(checkout, response);
    }

    res.status(202).json({ message: "Webhook accepted" });
  } catch (error) {
    next(error);
  }
};
