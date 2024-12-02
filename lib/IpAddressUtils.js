/* ------------------------------------------------------------------
* IpAddress.js
* IPアドレスに関するユーティリティ
* ---------------------------------------------------------------- */
'use strict';
const mOs = require('os');

class IpAddressUtils {
    constructor(ip_version) {
        this._ip_version = (ip_version === 6) ? 6 : 4;
        this._net_if_list = null;

        // EL ポート番号
        this._ENL_PORT = 3610;

        // EL マルチキャストアドレス
        this._ENL_MULTICAST_ADDRESS_V4 = "224.0.23.0";
        this._ENL_MULTICAST_ADDRESS_V6 = "ff02::1";
    }

    /* ------------------------------------------------------------------
    * getPortNumber()
    * EL のポート番号を取得
    * ---------------------------------------------------------------- */
    getPortNumber() {
        return this._ENL_PORT;
    }

    /* ------------------------------------------------------------------
    * getMulticastAddress()
    * EL のマルチキャストアドレスを取得
    * ---------------------------------------------------------------- */
    getMulticastAddress() {
        if (this._ip_version === 6) {
            return this._ENL_MULTICAST_ADDRESS_V6;
        } else {
            return this._ENL_MULTICAST_ADDRESS_V4;
        }
    }

    /* ------------------------------------------------------------------
    * getNetworkInterfaceList()
    * ネットワークインタフェースのリストを取得
    * ---------------------------------------------------------------- */
    getNetworkInterfaceList() {
        if (this._net_if_list) {
            return JSON.parse(JSON.stringify(this._net_if_list));
        }

        const netifs = mOs.networkInterfaces();
        const list = [];

        for (const [name, info_list] of Object.entries(netifs)) {
            // 仮想イーサネットは除外
            if (/^vEthernet/.test(name)) {
                continue;
            }

            for (const info of info_list) {
                // ローカルアドレスは除外
                if (info.internal) {
                    continue;
                }

                // IPバージョンが違えば除外
                if (info.family !== 'IPv' + this._ip_version) {
                    continue;
                }

                // リンクローカルアドレスは除外
                const addr = info.address;
                if (this._ip_version === 6) {
                    if (/^fe80\:\:/.test(addr)) {
                        continue;
                    }
                } else {
                    if (/^169\.254\./.test(addr)) {
                        continue;
                    }
                }

                // MAC アドレスが 00:00:00:00:00:00 なら除外
                // - NordVPN など
                if (info.mac === '00:00:00:00:00:00') {
                    continue;
                }

                list.push(addr);
            }
        }

        this._net_if_list = JSON.parse(JSON.stringify(list));
        return list;
    }


    /* ------------------------------------------------------------------
    * getNetworkScopeList()
    * ネットワークインタフェースのスコープのリストを取得
    * - IPv6 で setMulticastInterface() の引数に使われる
    * - https://nodejs.org/api/dgram.html#dgram_socket_setmulticastinterface_multicastinterface
    * ---------------------------------------------------------------- */
    getNetworkScopeList() {
        const netifs = mOs.networkInterfaces();
        const scopes = {};

        for (const info_list of Object.values(netifs)) {
            for (const info of info_list) {
                // ローカルアドレスは除外
                if (info.internal) {
                    continue;
                }

                // IPバージョンが違えば除外
                if (info.family !== 'IPv' + this._ip_version) {
                    continue;
                }

                // リンクローカルアドレスは除外
                const addr = info.address;
                if (this._ip_version === 6) {
                    if (/^fe80\:\:/.test(addr)) {
                        continue;
                    }
                } else {
                    if (/^169\.254\./.test(addr)) {
                        continue;
                    }
                }

                scopes['::%' + dev] = true;
            }
        }
        const list = Object.keys(scopes);
        return list;
    }

    /* ------------------------------------------------------------------
    * isLocalAddress(address)
    * 指定のIPアドレスがローカルアドレスなら true を、そうでなければ false を
    * 返す。
    * ---------------------------------------------------------------- */
    isLocalAddress(address) {
        const netifs = mOs.networkInterfaces();
        let hit = false;

        for (const info_list of Object.values(netifs)) {
            for (const info of info_list) {
                // IPバージョンが違えば除外
                if (info.family !== 'IPv' + this._ip_version) {
                    continue;
                }

                if (info.address === address) {
                    hit = true;
                }
            }
        }

        return hit;
    }
}


module.exports = IpAddressUtils;
