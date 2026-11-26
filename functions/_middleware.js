export async function onRequest(context) {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();

  // Permanently redirect all *.pages.dev and www requests to the canonical domain
  if (host.endsWith('.pages.dev') || host === 'www.imagelabkit.com') {
    url.hostname = 'imagelabkit.com';
    url.protocol = 'https:';
    url.port = '';
    return Response.redirect(url.toString(), 301);
  }

  return context.next();
}
