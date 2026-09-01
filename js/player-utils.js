(function (root) {
    function detectVideoType(value) {
        let pathname = '';
        try {
            const url = new URL(String(value || ''), root.location?.href || 'https://jumeitianxia.com/');
            pathname = url.pathname.toLowerCase();
        } catch (_) {
            pathname = String(value || '').toLowerCase().split(/[?#]/, 1)[0];
        }
        if (pathname.endsWith('.m3u8')) return 'hls';
        if (pathname.endsWith('.mp4') || pathname.endsWith('.webm') || pathname.endsWith('.ogg')) return 'normal';
        return 'auto';
    }

    root.LibretvPlayerUtils = { detectVideoType };
})(globalThis);
