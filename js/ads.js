// Adsterra 广告位统一加载器。
// 每个页面只加载一次对应广告，避免多个 atOptions 配置互相覆盖。
(function () {
    const ADS = {
        nativeBanner: {
            src: 'https://closurenosy.com/5ab709ddd4bc614f52a6cbd02931be38/invoke.js',
            containerId: 'container-5ab709ddd4bc614f52a6cbd02931be38'
        },
        banners: {
            wide: {
                width: 728,
                height: 90,
                key: 'df2b98674c7ec5c8b8322b6e8868010c',
                src: 'https://closurenosy.com/df2b98674c7ec5c8b8322b6e8868010c/invoke.js'
            },
            medium: {
                width: 468,
                height: 60,
                key: '2aa63bd3cd82c57f83a502262b245a01',
                src: 'https://closurenosy.com/2aa63bd3cd82c57f83a502262b245a01/invoke.js'
            },
            mobile: {
                width: 320,
                height: 50,
                key: '5e8661f13409efe73463c18b6d6f277a',
                src: 'https://closurenosy.com/5e8661f13409efe73463c18b6d6f277a/invoke.js'
            },
            square: {
                width: 300,
                height: 250,
                key: '96f20abe4e9e5d2c41ea6e4302114ad2',
                src: 'https://closurenosy.com/96f20abe4e9e5d2c41ea6e4302114ad2/invoke.js'
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
