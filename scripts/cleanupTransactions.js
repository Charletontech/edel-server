const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Op } = require('sequelize');
const https = require('https');
const { Transaction, AtlasCheckout, User } = require('../models');

// -- Atlas Configuration --
const ATLAS_API_KEY = process.env.ATLAS_API_KEY || process.env.API_KEY;
const ATLAS_SECRET_KEY = process.env.ATLAS_SECRET_KEY || process.env.secret || ATLAS_API_KEY;
const ATLAS_BASE_URL = process.env.ATLAS_BASE_URL || "https://atlas.tryduplo.com";
const ATLAS_VERIFY_PATH_TEMPLATE = process.env.ATLAS_VERIFY_PATH_TEMPLATE || "/api/v1/checkout/verify-by-reference/{reference}";

// Helper to wait to avoid rate limits
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Simplified Atlas Request logic
function atlasRequest(method, path) {
  return new Promise((resolve, reject) => {
    const keyToUse = ATLAS_API_KEY || ATLAS_SECRET_KEY;
    const url = new URL(path, ATLAS_BASE_URL);
    
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method,
      headers: {
        Authorization: `Bearer ${keyToUse}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject({ statusCode: res.statusCode, response: parsed });
          }
        } catch (e) {
          reject(new Error("Invalid response"));
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.end();
  });
}

function normalizeStatus(response) {
  if (!response) return "pending";
  const data = response.data || response;
  if (data.is_paid || data.paid || response.is_paid || response.paid) return "success";
  
  const rawStatus = data.status || data.transactionStatus || data.paymentStatus || response.status || "";
  const val = String(rawStatus).toLowerCase();
  
  if (["success", "successful", "paid", "completed", "approved", "settled"].includes(val)) return "success";
  if (["failed", "failure", "cancelled", "canceled", "expired", "abandoned", "declined"].includes(val)) return "failed";
  return "pending";
}

async function runCleanup() {
  console.log(`[${new Date().toISOString()}] Starting transaction cleanup...`);

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let hasMore = true;
    const BATCH_SIZE = 50; // Process 50 at a time to scale infinitely

    while (hasMore) {
      // Fetch a small batch of old pending checkouts
      const checkouts = await AtlasCheckout.findAll({
        where: {
          status: 'pending',
          createdAt: { [Op.lt]: sevenDaysAgo },
        },
        limit: BATCH_SIZE
      });

      if (checkouts.length === 0) {
        hasMore = false;
        break;
      }

      for (const checkout of checkouts) {
        processedCount++;
        const ref = checkout.sourceReference || checkout.checkoutReference;
        
        let finalStatus = "failed"; // Default to failing it if it's over 7 days and API check fails
        let verifyData = null;

        if (ref) {
          try {
            const apiRes = await atlasRequest("GET", ATLAS_VERIFY_PATH_TEMPLATE.replace("{reference}", encodeURIComponent(ref)));
            verifyData = apiRes;
            const apiStatus = normalizeStatus(apiRes);
            
            // If the gateway says it was actually successful, mark it success!
            if (apiStatus === "success") finalStatus = "success";
          } catch (err) {
            // If Atlas returns 404, it means the checkout was abandoned before generation or never completed.
            // We just let it fail.
            verifyData = err.response || err.message;
          }
        }

        // --- Database Updates ---
        const dbTx = await Transaction.sequelize.transaction();
        try {
          checkout.status = finalStatus;
          checkout.rawVerifyResponse = verifyData;
          await checkout.save({ transaction: dbTx });

          const mainTx = await Transaction.findByPk(checkout.transactionId, { transaction: dbTx });
          if (mainTx && mainTx.status === "pending") {
            mainTx.status = finalStatus;
            if (finalStatus === "success") mainTx.paidAt = new Date();
            await mainTx.save({ transaction: dbTx });
          }

          // If somehow it was successful, we MUST grant the user access!
          if (finalStatus === "success") {
            const user = await User.findByPk(checkout.userId, { transaction: dbTx });
            if (user) {
              user.hasPaidAccessFee = true;
              const now = new Date();
              let newExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
              if (user.accessFeeExpiresAt && new Date(user.accessFeeExpiresAt) > now) {
                newExpiry = new Date(new Date(user.accessFeeExpiresAt).getTime() + 30 * 24 * 60 * 60 * 1000);
              }
              user.accessFeeExpiresAt = newExpiry;
              await user.save({ transaction: dbTx });
            }
            successCount++;
          } else {
            failedCount++;
          }

          await dbTx.commit();
        } catch (dbErr) {
          await dbTx.rollback();
          console.error(`Error updating DB for checkout ${checkout.id}:`, dbErr.message);
        }

        // Sleep 150ms between API calls to completely avoid Atlas rate-limits
        await sleep(150); 
      }
    }

    console.log(`[${new Date().toISOString()}] Cleanup finished. Processed: ${processedCount} (Recovered Success: ${successCount}, Failed: ${failedCount}).`);
    process.exit(0);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Cleanup failed catastrophically:`, error);
    process.exit(1);
  }
}

runCleanup();
