export const ADS_CONFIG = {
    providers: {
        adsterra: {
            enabled: true
        },
        juicyads: {
            enabled: true,
            siteId: '316626',
            popunderPlacement: 'body',
            popunderContainerId: 'ad-popunder',
            popunderCode: '<!-- JuicyAds PopUnders v3 Start --> <script type="text/javascript" src="https://js.juicyads.com/jp.php?c=4474w233t244u4r2p2c4337474&u=https%3A%2F%2Fwww.jumeitianxia.com%2F"></script> <!-- JuicyAds PopUnders v3 End -->',
            popunderScriptSrc: '',
            slotSnippets: {
                'ad-juicy-responsive-banner': {
                    desktop: `<!-- JuicyAds v3.0 --> <script type="text/javascript" data-cfasync="false" async src="https://poweredby.jads.co/js/jads.js"></script> <ins id="1125773" data-width="300" data-height="250"></ins> <script type="text/javascript" data-cfasync="false" async>(adsbyjuicy = window.adsbyjuicy || []).push({'adzone':1125773});</script> <!--JuicyAds END-->`,
                    mobile: `<!-- JuicyAds v3.0 --> <script type="text/javascript" data-cfasync="false" async src="https://poweredby.jads.co/js/jads.js"></script> <ins id="1125774" data-width="300" data-height="50"></ins> <script type="text/javascript" data-cfasync="false" async>(adsbyjuicy = window.adsbyjuicy || []).push({'adzone':1125774});</script> <!--JuicyAds END-->`
                }
            }
        },
        adsense: {
            enabled: false
        }
    },
    slots: {
        'ad-responsive-banner': { provider: 'adsterra', elementId: 'ad-responsive-banner' },
        'ad-native-banner': { provider: 'adsterra', elementId: 'ad-native-banner' },
        'ad-square-banner': { provider: 'adsterra', elementId: 'ad-square-banner' },
        'ad-juicy-responsive-banner': { provider: 'juicyads', elementId: 'ad-juicy-responsive-banner' },
        'ad-popunder-juicyads': { provider: 'juicyads', elementId: 'ad-popunder' }
    }
};
