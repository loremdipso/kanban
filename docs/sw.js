// Service worker -- exists solely to receive push notifications. Push events
// are delivered to a worker, never to a page, so there has to be one even
// though this app has no interest in offline caching or intercepting fetches.
//
// Deliberately does NOT handle `fetch`. Registering a fetch handler would put
// this file in the path of every request the app makes, and a stale worker
// could then serve stale assets -- exactly the failure the version check
// (appVersion.svelte.ts) exists to avoid. Adding one later means thinking
// hard about cache invalidation first.
//
// Served from the app's own directory, so its scope is that directory -- see
// registerServiceWorker in push.svelte.ts.

self.addEventListener("install", () => {
  // Take over straight away rather than waiting for every existing tab to
  // close: there's no cached state for a version skew to corrupt (see above),
  // and waiting would mean notifications silently not working until the user
  // happened to close every tab.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // A push with no readable payload still means *something* happened, so it
  // shows a generic notification rather than nothing -- some push services
  // send an empty wake-up, and silently dropping it looks like a bug.
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "Companionship Kanban";
  const body = payload.body || "";
  const url = payload.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "favicon-192x192.png",
      badge: "favicon-192x192.png",
      // Collapses repeats: a second notification about the same task replaces
      // the first instead of stacking up a column of near-identical alerts.
      tag: url,
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Paths in the payload are app-relative ("/task/123"), but the app is
  // served from a subdirectory ("/kanban/"). The leading slash has to be
  // stripped before resolving: new URL("/task/123", ".../kanban/") resolves
  // an absolute path against the *origin*, giving ".../task/123" and
  // dropping the subdirectory entirely -- so every notification click landed
  // outside the app.
  const path = (event.notification.data && event.notification.data.url) || "/";
  const target = new URL(String(path).replace(/^\/+/, ""), self.registration.scope)
    .href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Prefer an existing tab -- opening a second copy of a local-first
        // app means a second SQLite mirror and a jarring reload, when the
        // open one can just navigate.
        for (const client of clients) {
          if (client.url.startsWith(self.registration.scope) && "focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
