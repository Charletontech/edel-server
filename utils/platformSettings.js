const { PlatformSetting } = require('../models');

const SETTING_DEFINITIONS = [
  {
    key: 'provider_rating_increment',
    value: 5,
    description: 'Provider rating increase after successful job without report'
  },
  {
    key: 'provider_report_penalty',
    value: 10,
    description: 'Provider rating decrease when a valid customer report is upheld'
  },
  {
    key: 'customer_complaint_penalty',
    value: 2,
    description: 'Customer rating decrease when a valid provider complaint is upheld'
  },
  {
    key: 'provider_access_fee_amount',
    value: 3500,
    description: 'One-time provider access fee amount'
  },
  {
    key: 'provider_free_order_limit',
    value: 3,
    description: 'Completed orders allowed before provider access fee is required'
  },
  {
    key: 'verification_max_distance_meters',
    value: 50,
    description: 'Maximum provider distance from customer during QR verification'
  },
  {
    key: 'verification_max_accuracy_meters',
    value: 100,
    description: 'Maximum GPS accuracy allowed during QR verification'
  }
];

const SETTING_KEYS = new Set(SETTING_DEFINITIONS.map((setting) => setting.key));

const coerceSettingValue = (value) => {
  const numericValue = Number(value);
  if (!Number.isNaN(numericValue) && value !== null && value !== '') {
    return numericValue;
  }

  return value;
};

const ensurePlatformSettings = async () => {
  for (const definition of SETTING_DEFINITIONS) {
    await PlatformSetting.findOrCreate({
      where: { key: definition.key },
      defaults: {
        value: String(definition.value),
        description: definition.description
      }
    });
  }
};

const getPlatformSettingsMap = async () => {
  await ensurePlatformSettings();
  const records = await PlatformSetting.findAll({
    order: [['key', 'ASC']]
  });

  return records.reduce((acc, record) => {
    acc[record.key] = coerceSettingValue(record.value);
    return acc;
  }, {});
};

const getPlatformSettingValue = async (key) => {
  await ensurePlatformSettings();
  const record = await PlatformSetting.findOne({ where: { key } });
  if (!record) return null;
  return coerceSettingValue(record.value);
};

module.exports = {
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  ensurePlatformSettings,
  getPlatformSettingsMap,
  getPlatformSettingValue
};
