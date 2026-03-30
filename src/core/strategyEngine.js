// Strategy Engine - AI selects strategy based on market condition
module.exports = {
    getStrategy: (market) => {
        switch (market) {
            case "TREND_UP":
            case "TREND_DOWN":
                return "TREND";

            case "SIDEWAY":
                return "REVERSAL";

            default:
                return "NO_TRADE";
        }
    }
};
