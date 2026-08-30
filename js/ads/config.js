export const ADS_CONFIG = {
    providers: {
        adsterra: {
            enabled: true
        },
        juicyads: {
            enabled: true,
            siteId: '316626',
            // JuicyAds only exposes PopUnder code after website verification.
            // The verified code will be added here after the provider releases it.
            popunderScriptSrc: '',
            popunderCode: '',
            slotSnippets: {}
        },
        adsense: {
            enabled: false
        }
    },
    slots: {
        'ad-responsive-banner': { provider: 'adsterra', elementId: 'ad-responsive-banner' },
        'ad-native-banner': { provider: 'adsterra', elementId: 'ad-native-banner' },
        'ad-square-banner': { provider: 'adsterra', elementId: 'ad-square-banner' },
        'ad-popunder-juicyads': { provider: 'juicyads', elementId: 'ad-popunder' }
    }
};
