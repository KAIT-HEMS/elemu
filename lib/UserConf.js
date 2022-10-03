/* ------------------------------------------------------------------
* UserConf.js
* ユーザー設定情報を扱うモジュール
* ---------------------------------------------------------------- */
'use strict';
const mFs = require('fs');
const mPath = require('path');

class UserConf {
  constructor(sys_conf) {
    this._sys_conf = sys_conf;
    this._fpath = mPath.resolve(__dirname, '../data/user_conf.json');
    this._uconf = null;
    this._UCONF_KEY_LIST = [
      'lang',
      'ip_address_version',
      'packet_log',
      'packet_log_days',
      'multicast_response_wait_min_msec',
      'multicast_response_wait_max_msec',
      'get_res_wait_msec',
      'set_res_wait_msec',
      'inf_res_wait_msec',
      'epc_data_setting_time_msec',
      'instance_announce_interval_sec',
      'property_announce_interval_sec'
    ];

    this.onupdated = () => { };
  }

  init() {
    if (!mFs.existsSync(this._fpath)) {
      try {
        mFs.writeFileSync(this._fpath, JSON.stringify({}));
      } catch (error) {
        throw error;
      }
    }
    let uconf = null;
    try {
      let json = mFs.readFileSync(this._fpath, 'utf8');
      uconf = JSON.parse(json);
    } catch (error) {
      throw error;
    }
    // システム設定のデフォルト値をマージ
    this._UCONF_KEY_LIST.forEach((k) => {
      if (!(k in uconf)) {
        uconf[k] = this._sys_conf[k];
      }
    });
    this._uconf = uconf;
  }

  /* ------------------------------------------------------------------
  * get()
  * ユーザー設定情報を取得する
  *
  * 引数:
  *   なし
  *
  * 戻値:
  * - 設定情報を格納したハッシュオブジェクト
  * ---------------------------------------------------------------- */
  get() {
    return JSON.parse(JSON.stringify(this._uconf));
  }

  /* ------------------------------------------------------------------
  * set(in_data)
  * ユーザー設定情報をセットする
  *
  * 引数:
  * - in_data = {}
  *   設定キーとそれに対応する値を格納したハッシュオブジェクト
  *   未知の設定キーは無視する
  *
  * 戻値:
  * - Promise オブジェクト
  * 
  * 指定された設定値が不正な値だったとしても reject() ではなく resolve() を
  * 呼び出す。reject() が呼び出されるのは、ファイル書き込みに失敗したときなど。
  *
  * resolve() には、結果を表すオブジェクトが渡される:
  *   result | Interger | 値エラーの数 (すべて成功すれば 0),
  *   data   | Object   | 保存した設定値を格納したハッシュオブジェクト
  *          |          | エラーの場合は存在しない
  *   errs   | Object   | 不正な値のキーとエラーメッセージを格納したハッシュオブジェクト
  *          |          | 成功の場合は存在しない
  * ---------------------------------------------------------------- */
  set(in_data) {
    return new Promise((resolve, reject) => {
      if (!in_data || typeof (in_data) !== 'object' || Object.keys(in_data).length === 0) {
        reject(new Error('No parameter was passed.'));
        return;
      }
      let res = this._checkValues(in_data);
      if (res['result'] === 0) {
        let data = res['data'];
        Object.keys(data).forEach((k) => {
          this._uconf[k] = data[k];
        });
        mFs.writeFile(this._fpath, JSON.stringify(this._uconf), (error) => {
          if (error) {
            reject(error);
          } else {
            let o = JSON.parse(JSON.stringify(this._uconf));
            this.onupdated(o);
            resolve(res);
          }
        });
      } else {
        resolve(res);
      }
    });
  }

  _checkValues(in_data) {
    let data = {};
    let errs = {};

    Object.keys(in_data).forEach((k) => {
      let v = in_data[k];
      if (k === 'lang') {
        if (/^(ja|en)$/.test(v)) {
          data[k] = v;
        } else {
          errs[k] = 'The `' + k + '` must be `ja` or `en`.';
        }
      } else if (k === 'ip_address_version') {
        if (typeof (v) === 'number' && (v === 4 || v === 6)) {
          data[k] = v;
        } else {
          errs[k] = 'The `' + k + '` must be `4` or `6`.';
        }
      } else if (k === 'packet_log') {
        if (typeof (v) === 'boolean') {
          data[k] = v;
        } else {
          errs[k] = 'The `' + k + '` must be `true` or `false`.';
        }
      } else if (k === 'packet_log_days') {
        if (typeof (v) === 'number' && v % 1 === 0 && v >= 1 && v <= 365) {
          data[k] = v;
        } else {
          errs[k] = 'The `' + k + '` must be an integer between 1 and 365.';
        }
      } else if (/^multicast_response_wait_(min|max)_msec$/.test(k)) {
        if (typeof (v) === 'number' && v % 1 === 0 && v >= 1 && v <= 10000) {
          data[k] = v;
        } else {
          errs[k] = 'The `' + k + '` must be an integer between 1 and 10000.';
        }
      } else if (/^(get|set|inf)_res_wait_msec$/.test(k)) {
        if (typeof (v) === 'number' && v % 1 === 0 && v >= 0 && v <= 100000) {
          data[k] = v;
        } else {
          errs[k] = 'The `' + k + '` must be an integer between 0 and 100000.';
        }
      } else if (k === 'epc_data_setting_time_msec') {
        if (typeof (v) === 'number' && v % 1 === 0 && v >= 0 && v <= 100000) {
          data[k] = v;
        } else {
          errs[k] = 'The `' + k + '` must be an integer between 0 and 100000.';
        }
      } else if (/^(instance|property)_announce_interval_sec$/.test(k)) {
        if (typeof (v) === 'number' && v % 1 === 0 && v >= 0 && v <= 86400) {
          data[k] = v;
        } else {
          errs[k] = 'The `' + k + '` must be an integer between 0 and 86400.';
        }
      }
    });

    let err_num = Object.keys(errs).length;
    if (err_num === 0) {
      return {
        result: err_num,
        data: data
      };
    } else {
      return {
        result: err_num,
        errs: errs
      };
    }
  }
}

module.exports = UserConf;
