/* ------------------------------------------------------------------
* PacketLogger.js
* パケット送受信データのロギングを扱うモジュール
* ---------------------------------------------------------------- */
'use strict';
const mPath = require('path');
const mFs = require('fs');

class PacketLogger {
  /* ------------------------------------------------------------------
  * Constructor 
  * - conf              | object  | optional |
  *   - packet_log_days | integer | optional | ログ保存日数
  * ---------------------------------------------------------------- */
  constructor(conf) {
    if (!conf || typeof (conf) !== 'object') {
      conf = {};
    }
    // ログファイル保存日数
    this._log_days = 3;
    let log_days = conf['packet_log_days'];
    if (typeof (log_days) === 'number' && log_days % 1 === 0 && log_days > 0 || log_days < 365) {
      this._log_days = log_days;
    }
    // ログファイル格納ディレクトリのパス
    this._log_dir = mPath.resolve(__dirname, '../logs');
  }

  /* ------------------------------------------------------------------
  * init()
  * 初期化
  * ---------------------------------------------------------------- */
  init() {
    if (!mFs.existsSync(this._log_dir)) {
      throw new Error('The directory `' + this._log_dir + ' was not found.');
    }
    if (!mFs.statSync(this._log_dir).isDirectory()) {
      throw new Error('The directory `' + this._log_dir + ' was not a directory.');
    }
    setInterval(() => {
      this._delteOldLogFiles();
    }, 3600000);
    this._delteOldLogFiles();
  }

  /* ------------------------------------------------------------------
  * tx(address, parsed)
  * 送信ログ書き込み
  * ---------------------------------------------------------------- */
  tx(address, parsed) {
    this._log('tx', address, parsed);
  }

  /* ------------------------------------------------------------------
  * rx(address, parsed)
  * 受信ログ書き込み
  * ---------------------------------------------------------------- */
  rx(address, parsed) {
    this._log('rx', address, parsed);
  }

  _log(direction, address, parsed) {
    if (!parsed) {
      return;
    }

    let dt = new Date();
    let date = this._getDate(dt);
    let time_stamp = this._getTimeStamp(dt);

    let log_cols = [
      time_stamp,
      direction.toUpperCase(),
      address,
      parsed['result']
    ];
    if (parsed['result'] === 0) {
      log_cols.push('"' + parsed['data']['hex'] + '"');
      log_cols.push('""');
    } else {
      log_cols.push('"' + parsed['hex'] + '"');
      log_cols.push('"' + parsed['message'] + '"');
    }
    let log = log_cols.join(' ') + '\n';

    let fpath = this._log_dir + '/packet.' + date + '.log';
    mFs.appendFile(fpath, log, 'utf8', (error) => {
      if (error) {
        console.error(error);
      }
    });
  }

  /* ------------------------------------------------------------------
  * txError(address, parsed)
  * 送信エラーログ書き込み
  *
  * - address   | 必須 | 送信パケットなら宛先の、受信パケットなら送信元の IP アドレス
  * - parsed    | 必須 | EL パケット解析済みオブジェクト
  * ---------------------------------------------------------------- */
  txError(address, parsed) {
    this._error('tx', address, parsed);
  }

  /* ------------------------------------------------------------------
  * rxError(message, address, parsed)
  * 受信エラーログ書き込み
  *
  * - address   | 必須 | 送信パケットなら宛先の、受信パケットなら送信元の IP アドレス
  * - parsed    | 必須 | EL パケット解析済みオブジェクト
  * ---------------------------------------------------------------- */
  rxError(address, parsed) {
    this._error('rx', address, parsed);
  }

  _error(direction, address, parsed) {
    if (!parsed) {
      return;
    }

    let dt = new Date();
    let date = this._getDate(dt);
    let time_stamp = this._getTimeStamp(dt);

    let log_cols = [
      time_stamp,
      direction.toUpperCase(),
      address,
      parsed['result']
    ];

    log_cols.push('"' + parsed['hex'] + '"');
    log_cols.push('"' + parsed['message'] + '"');

    let log = log_cols.join(' ') + '\n';

    if (parsed['data']) {
      log += '\n';
      log += JSON.stringify(parsed['data'], null, '  ');
      log += '\n';
    }

    let fpath = this._log_dir + '/packet.error.' + date + '.log';
    mFs.appendFile(fpath, log, 'utf8', (error) => {
      if (error) {
        console.error(error);
      }
    });
  }

  _getTimeStamp(dt) {
    let date = this._getDate(dt);
    let time = this._getTime(dt);
    let tz = this._getTz(dt);
    let time_stamp = date + 'T' + time + tz;
    return time_stamp;
  }

  _getDate(dt) {
    let Y = dt.getFullYear();
    let M = this._zeroPadding(dt.getMonth() + 1);
    let D = this._zeroPadding(dt.getDate());
    return [Y, M, D].join('-');
  }

  _getTime(dt) {
    let h = this._zeroPadding(dt.getHours());
    let m = this._zeroPadding(dt.getMinutes());
    let s = this._zeroPadding(dt.getSeconds());
    let ms = ('00' + dt.getMilliseconds()).slice(-3);
    return [h, m, s].join(':') + '.' + ms;
  }

  _getTz(dt) {
    let tzoffset = dt.getTimezoneOffset();
    let tz = (tzoffset >= 0) ? '-' : '+';
    tzoffset = Math.abs(tzoffset);
    tz += this._zeroPadding(parseInt(tzoffset / 60, 10));
    tz += ':';
    tz += this._zeroPadding(parseInt(tzoffset % 60));
    return tz;
  }

  _zeroPadding(n) {
    return ('0' + n).slice(-2);
  }

  _delteOldLogFiles() {
    // x日前の日付 (YYYYMMDDを数値型に)
    let dt = new Date();
    dt.setDate(dt.getDate() - this._log_days);
    let pastday = parseInt(this._getDate(dt).replace(/\-/g, ''), 10);
    // logsディレクトリ内のファイルの一覧
    mFs.readdir(this._log_dir, (error, files) => {
      if (error) {
        this.error(error);
        return;
      }
      let deleteFile = () => {
        let fname = files.shift();
        if (!fname) {
          return;
        }
        let m = fname.match(/^packet\.(\d{4})\-(\d{2})\-(\d{2})\.log$/);
        if (!m) {
          m = fname.match(/^packet\.error\.(\d{4})\-(\d{2})\-(\d{2})\.log$/);
        }
        if (!m) {
          return;
        }
        let d = parseInt(m[1] + m[2] + m[3], 10);
        if (d >= pastday) {
          deleteFile();
          return;
        }
        let fpath = this._log_dir + '/' + fname;
        mFs.unlink(fpath, (error) => {
          if (error) {
            console.error(error);
          }
          deleteFile();
        });
      };
      deleteFile();
    });
  }
}

module.exports = PacketLogger;
