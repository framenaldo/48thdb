/* The site itself. Everything it serves is a static file — the one thing worth
 * code is keeping a single address.
 *
 * www and the bare domain would otherwise be two origins: two service worker
 * registrations, two sets of saved settings, and a sign-in that only works on
 * whichever of them Firebase has been told about. So www is sent to the bare
 * domain and the rest is handed to the assets.
 */
const CANONICAL = '48thdb.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === `www.${CANONICAL}`) {
      url.hostname = CANONICAL;
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
