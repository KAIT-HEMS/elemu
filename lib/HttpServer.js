/* ------------------------------------------------------------------
* httpServer.js
* ダッシュボード Web アプリ, REST API 用の Web サーバーと WebSocket サーバー
* ---------------------------------------------------------------- */
'use strict';

const mHttp = require('http');
const mWebSocket = require('ws');
const mExpress = require('express');
const mBodyParser = require('body-parser');
const mPath = require('path');
const mUrl = require('url');

class HttpServer {
  constructor(conf, oconsole) {
    this._conf = conf;
    this._console = oconsole;

    this._http_server = null;
    this._wss = null;
    this._app = mExpress();

    this._req_pool = {};
    this._req_id = 0;

    this.onrequested = () => { };
  }

  start() {
    let promise = new Promise((resolve, reject) => {
      let server = mHttp.createServer(this._app);
      this._http_server = server;
      this._wss = new mWebSocket.Server({ server });

      this._defineRouting();
      this._startWatchingReqPool();

      server.listen(this._conf['dashboard_port'], () => {
        resolve();
      });
    });
    return promise;
  }

  _startWatchingReqPool() {
    let sec = this._conf['dashboard_timeout_sec'];
    if (!sec || typeof (sec) !== 'number') {
      sec = 30;
    }
    let watch = () => {
      Object.keys(this._req_pool).forEach((req_id) => {
        let req = this._req_pool[req_id];
        if (Date.now() - req['time'] > sec * 1000) {
          let data = req['data'];
          data['result'] = 1001;
          data['message'] = 'Response Timeout.';
          this.respond(504, data);
          delete this._req_pool[req_id];
        }
      });
      setTimeout(() => {
        watch();
      }, 1000);
    };
    watch();
  }

  _defineRouting() {
    // CORS headers
    this._app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Access-Key, Content-Type, Accept');
      res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
      next();
    });
    // For CORS preflight request
    this._app.options('*', (req, res) => {
      res.sendStatus(200);
    });

    this._app.use(mBodyParser.urlencoded({ extended: false }));
    this._app.use(mBodyParser.json());

    this._app.use((req, res, next) => {
      if (/^\/api\//.test(req.path)) {
        // リクエストID生成
        let req_id = this._assignReqId();
        let url_parts = mUrl.parse(req.url, true);
        let params = url_parts.query;
        if (/^(PUT|POST)$/.test(req.method)) {
          params = req.body;
        }
        let data = {
          reqId: req_id,
          method: req.method,
          path: url_parts.pathname,
          params: params
        };
        this._req_pool[req_id] = {
          req: req,
          res: res,
          data: data,
          time: Date.now()
        };
        this.onrequested(data);
      } else {
        next();
      }
    });

    // 静的ファイル格納場所を定義
    this._app.use(mExpress.static(mPath.resolve(__dirname, '../html')));

    // body-parser などの例外をキャッチ
    //   基本的には POST/PUT された JSON の構文エラー
    this._app.use((error, req, res, next) => {
      res.status(400);
      res.header('Content-Type', 'application/json; charset=utf-8');
      res.send({
        result: 1,
        code: 400,
        message: error.message,
        errs: {}
      });
    });
  }

  _assignReqId() {
    return (++this._req_id);
  }

  respond(http_code, data) {
    if (!('reqId' in data)) {
      return;
    }

    let req_id = data['reqId'];
    if (!(req_id in this._req_pool)) {
      return;
    }
    delete data['reqId'];
    let res = this._req_pool[req_id]['res'];
    res.status(http_code);
    res.header('Content-Type', 'application/json; charset=utf-8');
    res.send(data);

    let req = this._req_pool[req_id]['req'];
    delete this._req_pool[req_id];
  }

  wsSend(o) {
    this._wss.clients.forEach((client) => {
      if (client.readyState === mWebSocket.OPEN) {
        client.send(JSON.stringify(o), (error) => {
          if (error) {
            this._console.printError('Failed to send a message on the WebSocket channel.', error);
          }
        });
      }
    });
  }
}

module.exports = HttpServer;

