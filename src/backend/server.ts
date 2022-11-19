import './loadenv';
import sslcreds from './sslcreds';
import express from 'express';
import spdy from 'spdy';
import vhost from 'vhost';
import appctl from './app';
import { toBoolean } from '../shared/util/genericUtil';

// You shouldn't need to change anything in this file.
// Application init code should go in `app.ts`, not here.

(async () => {
  console.log(`[Init] Booting server; in ${process.env.NODE_ENV} mode ...`);
  const app = await appctl.init();

  app.listen(parseInt(process.env.HTTP_PORT), () => {
    console.log(`[Init] HTTP/2 Server running on port ${process.env.HTTP_PORT}`);
  });

  let httpsApp = app;
  let httpsPort: number = parseInt(process.env.HTTPS_PORT);

  if (toBoolean(process.env.VHOSTED)) {
    httpsApp = express();
    httpsApp.use(vhost(process.env.VHOST, app));
    httpsPort = 443; // override
  }

  if (toBoolean(process.env.SSL_ENABLED)) {
    spdy.createServer(sslcreds, httpsApp).listen(httpsPort, () => {
      console.log(`[Init] HTTPS/2 Server running on port ${httpsPort}`
        + (process.env.VHOSTED ? ' (in VHOSTED mode)' : ''));

        if (process.env.VHOSTED) {
          console.log('[Init] Node app is running at https://' + process.env.VHOST);
        }
    });
  } else {
    console.log('[Init] Not starting HTTPS server: not enabled');
  }
})();