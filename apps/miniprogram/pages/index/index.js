Page({
  data: {
    webUrl: 'https://avalon.ccnepower.com:8443/'
  },
  onLoad(options) {
    if (options && options.invite) {
      this.setData({
        webUrl: 'https://avalon.ccnepower.com:8443/?invite=' + encodeURIComponent(options.invite)
      });
    }
  },
  onShareAppMessage(options) {
    const webUrl = options.webViewUrl || this.data.webUrl;
    let invite = '';
    const match = webUrl.match(/[?&]invite=([^&#]+)/);
    if (match) {
      invite = decodeURIComponent(match[1]);
    }
    return {
      title: '来嘻游 · 真假猴王 一起论剑',
      path: invite ? '/pages/index/index?invite=' + encodeURIComponent(invite) : '/pages/index/index'
    };
  },
  onMessage(e) {
    console.log('Message from web-view:', e.detail);
  },
  onLoadSuccess(e) {
    console.log('Web-view loaded successfully:', e.detail);
  },
  onError(e) {
    console.error('Web-view failed to load:', e.detail);
  }
});
