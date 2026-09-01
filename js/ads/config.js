const homepageInlineEligibility = ({ document, viewportWidth }) => (
    !document?.getElementById?.('homepageMobileAds') || viewportWidth < 1664
);

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
                'ad-juicy-home-banner': {
                    desktop: `<!-- JuicyAds v3.0 --> <script type="text/javascript" data-cfasync="false" async src="https://poweredby.jads.co/js/jads.js"></script> <ins id="1125830" data-width="728" data-height="90"></ins> <script type="text/javascript" data-cfasync="false" async>(adsbyjuicy = window.adsbyjuicy || []).push({'adzone':1125830});</script> <!--JuicyAds END-->`,
                    sidebar: `<!-- JuicyAds v3.0 --> <script type="text/javascript" data-cfasync="false" async src="https://poweredby.jads.co/js/jads.js"></script> <ins id="1125773" data-width="300" data-height="250"></ins> <script type="text/javascript" data-cfasync="false" async>(adsbyjuicy = window.adsbyjuicy || []).push({'adzone':1125773});</script> <!--JuicyAds END-->`,
                    mobile: `<!-- JuicyAds v3.0 --> <script type="text/javascript" data-cfasync="false" async src="https://poweredby.jads.co/js/jads.js"></script> <ins id="1125774" data-width="300" data-height="50"></ins> <script type="text/javascript" data-cfasync="false" async>(adsbyjuicy = window.adsbyjuicy || []).push({'adzone':1125774});</script> <!--JuicyAds END-->`
                },
                'ad-juicy-player-banner': {
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
        'ad-home-left-rail': {
            provider: 'adsterra',
            elementId: 'ad-home-left-rail',
            format: 'verticalTall',
            minViewport: 1664
        },
        'ad-home-right-rail': {
            provider: 'adsterra',
            elementId: 'ad-home-right-rail',
            format: 'verticalShort',
            minViewport: 1664
        },
        'ad-responsive-banner': {
            provider: 'adsterra',
            elementId: 'ad-responsive-banner',
            desktopFormat: 'square',
            desktopBreakpoint: 1280,
            eligible: homepageInlineEligibility
        },
        'ad-native-banner': { provider: 'adsterra', elementId: 'ad-native-banner', eligible: homepageInlineEligibility },
        'ad-square-banner': { provider: 'adsterra', elementId: 'ad-square-banner', eligible: homepageInlineEligibility },
        'ad-juicy-home-banner': {
            provider: 'juicyads',
            elementId: 'ad-juicy-home-banner',
            desktopVariant: 'sidebar',
            desktopBreakpoint: 1280,
            eligible: homepageInlineEligibility
        },
        'ad-juicy-player-banner': { provider: 'juicyads', elementId: 'ad-juicy-player-banner' },
        'ad-popunder-juicyads': { provider: 'juicyads', elementId: 'ad-popunder' }
    }
};
