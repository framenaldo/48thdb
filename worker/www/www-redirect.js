/* www.48thdb.com exists only to send people to 48thdb.com.
 *
 * It is a Worker of its own rather than a branch inside the site Worker: the
 * site serves its files straight from the assets store without running any
 * code, which is both faster and free, and putting a hostname check in front
 * of it would give that up for every request to the real domain.
 */
const CANONICAL = 'https://48thdb.com';

export default {
  fetch(request) {
    const from = new URL(request.url);
    const to = new URL(from.pathname + from.search + from.hash, CANONICAL);
    return Response.redirect(to.toString(), 301);
  },
};
