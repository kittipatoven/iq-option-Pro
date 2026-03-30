/**
 * Predefined High-Impact Economic News Schedule
 * Time format: HH:MM (24-hour format in UTC)
 * These are typical times when major economic indicators are released
 */

const newsSchedule = [
    // USD News (US Economic Data - typically 8:30 AM and 10:00 AM EST = 13:30 and 15:00 UTC)
    { time: "13:30", currency: "USD", impact: "HIGH", name: "Non-Farm Payrolls" },
    { time: "13:30", currency: "USD", impact: "HIGH", name: "CPI" },
    { time: "13:30", currency: "USD", impact: "HIGH", name: "GDP" },
    { time: "13:30", currency: "USD", impact: "HIGH", name: "Initial Jobless Claims" },
    { time: "15:00", currency: "USD", impact: "HIGH", name: "ISM Manufacturing" },
    { time: "15:00", currency: "USD", impact: "HIGH", name: "ISM Services" },
    { time: "15:00", currency: "USD", impact: "HIGH", name: "Consumer Confidence" },
    { time: "18:00", currency: "USD", impact: "HIGH", name: "FOMC Statement" },
    { time: "18:00", currency: "USD", impact: "HIGH", name: "Fed Interest Rate Decision" },
    { time: "19:00", currency: "USD", impact: "HIGH", name: "FOMC Press Conference" },
    
    // EUR News (EU Economic Data - typically 7:00 AM and 10:00 AM CET = 6:00 and 9:00 UTC)
    { time: "06:00", currency: "EUR", impact: "HIGH", name: "ECB Interest Rate" },
    { time: "09:00", currency: "EUR", impact: "HIGH", name: "EU CPI" },
    { time: "09:00", currency: "EUR", impact: "HIGH", name: "EU GDP" },
    { time: "10:00", currency: "EUR", impact: "HIGH", name: "ECB Press Conference" },
    { time: "10:00", currency: "EUR", impact: "HIGH", name: "German ZEW Economic Sentiment" },
    { time: "10:00", currency: "EUR", impact: "HIGH", name: "EU Consumer Confidence" },
    
    // GBP News (UK Economic Data - typically 7:00 AM and 9:30 AM GMT = 7:00 and 9:30 UTC)
    { time: "07:00", currency: "GBP", impact: "HIGH", name: "Bank of England Rate" },
    { time: "07:00", currency: "GBP", impact: "HIGH", name: "UK CPI" },
    { time: "07:00", currency: "GBP", impact: "HIGH", name: "UK GDP" },
    { time: "09:30", currency: "GBP", impact: "HIGH", name: "UK PMI Manufacturing" },
    { time: "09:30", currency: "GBP", impact: "HIGH", name: "UK PMI Services" },
    { time: "12:00", currency: "GBP", impact: "HIGH", name: "BoE Gov Bailey Speech" },
    
    // JPY News (Japan Economic Data - typically 7:50 AM and 8:30 AM JST = 22:50 and 23:30 UTC previous day)
    { time: "22:50", currency: "JPY", impact: "HIGH", name: "Japan CPI" },
    { time: "23:30", currency: "JPY", impact: "HIGH", name: "BoJ Interest Rate" },
    { time: "23:50", currency: "JPY", impact: "HIGH", name: "Japan GDP" },
    { time: "23:50", currency: "JPY", impact: "HIGH", name: "Japan Tankan" },
    { time: "01:30", currency: "JPY", impact: "HIGH", name: "Japan PMI" },
    
    // AUD News (Australia Economic Data - typically 9:30 AM and 11:30 AM AEST = 23:30 and 01:30 UTC)
    { time: "00:30", currency: "AUD", impact: "HIGH", name: "RBA Interest Rate" },
    { time: "00:30", currency: "AUD", impact: "HIGH", name: "Australia CPI" },
    { time: "00:30", currency: "AUD", impact: "HIGH", name: "Australia Employment" },
    { time: "02:30", currency: "AUD", impact: "HIGH", name: "Australia GDP" },
    
    // CAD News (Canada Economic Data - typically 8:30 AM EST = 13:30 UTC)
    { time: "13:30", currency: "CAD", impact: "HIGH", name: "Canada Employment" },
    { time: "13:30", currency: "CAD", impact: "HIGH", name: "Canada CPI" },
    { time: "13:30", currency: "CAD", impact: "HIGH", name: "Canada GDP" },
    { time: "15:00", currency: "CAD", impact: "HIGH", name: "BoC Interest Rate" },
    
    // CHF News (Switzerland Economic Data - typically 8:30 AM CET = 7:30 UTC)
    { time: "07:30", currency: "CHF", impact: "HIGH", name: "SNB Interest Rate" },
    { time: "07:30", currency: "CHF", impact: "HIGH", name: "Switzerland CPI" },
    { time: "08:00", currency: "CHF", impact: "HIGH", name: "Switzerland GDP" },
    
    // NZD News (New Zealand Economic Data - typically 8:45 AM NZST = 19:45 UTC)
    { time: "19:45", currency: "NZD", impact: "HIGH", name: "RBNZ Interest Rate" },
    { time: "21:45", currency: "NZD", impact: "HIGH", name: "New Zealand CPI" },
    { time: "21:45", currency: "NZD", impact: "HIGH", name: "New Zealand GDP" },
    { time: "21:45", currency: "NZD", impact: "HIGH", name: "New Zealand Employment" }
];

module.exports = newsSchedule;
