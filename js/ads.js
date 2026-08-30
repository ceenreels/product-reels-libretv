// Adsterra 广告位统一加载器。
// 每个页面只加载一次对应广告，避免多个 atOptions 配置互相覆盖。
(function () {
    const ADS = {
        popunder: {
            src: 'https://pl31085490.profitableratecpmnetwork.com/1e/b9/a6/1eb9a62a6a4cb9cd25813b4d2c1341de.js'
        },
        socialBar: {
            src: 'https://pl31085491.profitableratecpmnetwork.com/b7/58/b0/b758b0306a71fb06846e2cfd07fc471e.js'
        },
        nativeBanner: {
            src: 'https://pl31089670.profitableratecpmnetwork.com/5ab709ddd4bc614f52a6cbd02931be38/invoke.js',
            containerId: 'container-5ab709ddd4bc614f52a6cbd02931be38'
        },
        banners: {
            wide: {
                width: 728,
                height: 90,
                key: 'df2b98674c7ec5c8b8322b6e8868010c',
                src: 'https://www.highrevenueformat.com/df2b98674c7ec5c8b8322b6e8868010c/invoke.js'
            },
            medium: {
                width: 468,
                height: 60,
                key: '2aa63bd3cd82c57f83a502262b245a01',
                src: 'https://www.highrevenueformat.com/2aa63bd3cd82c57f83a502262b245a01/invoke.js'
            },
            mobile: {
                width: 320,
                height: 50,
                key: '5e8661f13409efe73463c18b6d6f277a',
                src: 'https://www.highrevenueformat.com/5e8661f13409efe73463c18b6d6f277a/invoke.js'
            },
            square: {
                width: 300,
                height: 250,
                key: '96f20abe4e9e5d2c41ea6e4302114ad2',
                src: 'https://www.highrevenueformat.com/96f20abe4e9e5d2c41ea6e4302114ad2/invoke.js'
            }
        }
    };

    let bannerLoadQueue = Promise.resolve();

    function appendExternalScript(container, src, dataKey, attributes = {}) {
        if (!container || container.querySelector(`script[data-libretv-ad="${dataKey}"]`)) return;

        const script = document.createElement('script');
        script.src = src;
        script.dataset.libretvAd = dataKey;
        Object.entries(attributes).forEach(([name, value]) => {
            if (value === true) script.setAttribute(name, '');
            else if (value !== false && value != null) script.setAttribute(name, value);
        });
        container.appendChild(script);
    }

    function loadServiceAd(slotId, ad, dataKey) {
        const slot = document.getElementById(slotId);
        if (!slot) return;
        appendExternalScript(slot, ad.src, dataKey, { async: true });
    }

    function loadNativeBanner() {
        const slot = document.getElementById('ad-native-banner');
        if (!slot || slot.dataset.loaded === 'true') return;

        let container = document.getElementById(ADS.nativeBanner.containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = ADS.nativeBanner.containerId;
            slot.appendChild(container);
        }
        appendExternalScript(slot, ADS.nativeBanner.src, 'native-banner', {
            async: true,
            'data-cfasync': 'false'
        });
        slot.dataset.loaded = 'true';
    }

    function getResponsiveBanner() {
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        if (viewportWidth >= 900) return ADS.banners.wide;
        if (viewportWidth >= 520) return ADS.banners.medium;
        return ADS.banners.mobile;
    }

    function loadAtOptionsBanner(slotId, ad, dataKey) {
        const slot = document.getElementById(slotId);
        if (!slot || slot.dataset.loaded === 'true') return;

        slot.dataset.loaded = 'true';
        // Adsterra 的 Banner 代码通过全局 atOptions 读取当前广告配置。
        // 逐个等待脚本完成，避免后一个广告覆盖前一个广告的配置。
        bannerLoadQueue = bannerLoadQueue.then(() => new Promise(resolve => {
            window.atOptions = {
                key: ad.key,
                format: 'iframe',
                height: ad.height,
                width: ad.width,
                params: {}
            };
            const script = document.createElement('script');
            script.src = ad.src;
            script.dataset.libretvAd = dataKey;
            script.onload = resolve;
            script.onerror = resolve;
            slot.appendChild(script);
        }));
    }

    function initAds() {
        loadServiceAd('ad-popunder', ADS.popunder, 'popunder');
        loadServiceAd('ad-social-bar', ADS.socialBar, 'social-bar');
        loadNativeBanner();
        loadAtOptionsBanner('ad-responsive-banner', getResponsiveBanner(), 'responsive-banner');
        loadAtOptionsBanner('ad-square-banner', ADS.banners.square, 'square-banner');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAds, { once: true });
    } else {
        initAds();
    }
})();
