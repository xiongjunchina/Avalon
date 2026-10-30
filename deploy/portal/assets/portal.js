// Old bookmarks may carry fragments that the HTTP server cannot see.
const url = new URL(location.href);
if (url.pathname === '/' && (url.searchParams.has('invite') || url.searchParams.has('admin') || url.searchParams.get('page') === 'admin' || url.hash.includes('admin'))) {
  location.replace('/avalon/' + url.search + url.hash);
}
