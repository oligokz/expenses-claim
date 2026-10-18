// Error plumbing shared by every handler.
//
// A 4xx carries a message written for the person using the form ("Pick an
// approver from the list"), so it goes back as is. A 5xx is our failure and its
// message is usually a raw Graph or token response, which can name columns,
// lists or tenant details, so it is logged and the browser gets a generic line
// plus the request id to find it in the Vercel logs. An error made with
// httpError() is always written for the user, so it is shown whatever its status.

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  return e;
}

/** Log and send an error. `tag` names the handler in the log line. */
function sendError(req, res, err, tag) {
  const status = err.status || 500;
  if (status < 500 || err.expose) return res.status(status).json({ error: err.message });

  const ref = String(req.headers['x-vercel-id'] || '').split('::').pop() || '';
  console.error(`[${tag}] ERROR${ref ? ` (${ref})` : ''}:`, err.message);
  return res.status(status).json({
    error: 'Something went wrong on our side. Please try again, and contact IT if it keeps happening.',
    ref,
  });
}

module.exports = { httpError, sendError };
