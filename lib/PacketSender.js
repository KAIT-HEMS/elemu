/* ------------------------------------------------------------------
* PacketSender.js
* - EL パケットを送信するモジュール
* - 同時に EL パケットを送信することがないようキュー管理する
* ---------------------------------------------------------------- */
'use strict';

class PacketSender {
    constructor(conf, udp, ip_address_utils) {
        this._conf = conf;
        this._udp = udp;
        this._ip_address_utils = ip_address_utils;

        this._queue = [];
        this._trans_timer = null;
        this._is_sending = false;
    }

    /* ------------------------------------------------------------------
    * send(address, buf)
    * - パケットを送信する
    *
    * 引数
    * - address | String | optional | 宛先 IP アドレス。
    *           |        |          | 指定がなければマルチキャストアドレスがセットされる。
    * - buf     | Buffer | required | パケットを表す Buffer オブジェクト
    *
    * 戻値
    * - Promise オブジェクト
    * - resolve() には、送信先の IP アドレスが引き渡される。
    * ---------------------------------------------------------------- */
    send(address, buf) {
        return new Promise((resolve, reject) => {
            // IP アドレスの指定がなければマルチキャストアドレス
            if (!address) {
                address = this._ip_address_utils.getMulticastAddress();
            }
            // パケット送信キューに送信パケット情報を挿入
            this._pushPacketToQueue(address, buf, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(address);
                }
            });
        });
    }

    _pushPacketToQueue(address, buf, callback) {
        this._queue.push({
            address: address,
            buffer: buf,
            callback: callback
        });
        if (!this._is_sending) {
            this._is_sending = true;
            this._sendPacketSequentially();
        }
    }

    async _sendPacketSequentially() {
        const packet = this._queue.shift();
        if (!packet) {
            this._is_sending = false;
            return;
        }
        this._is_sending = true;
        const buf = packet['buffer'];
        const address = packet['address'];
        const callback = packet['callback'];

        // マルチキャストかどうかを判定
        //   - Linux などではメンバーシップをドロップしないといけない。
        //   - その判定のために使う。
        const mc_flag = (address === this._ip_address_utils.getMulticastAddress());

        // マルチキャストならメンバーシップをドロップしてから処理する
        if (mc_flag) {
            this._dropMembership();
            await this._wait(200);

            let err = null;

            try {
                const netif_list = this._ip_address_utils.getNetworkInterfaceList();
                for (const netif of netif_list) {
                    this._udp.setMulticastInterface(netif);
                    await this._wait(100);
                    await this._sendPacket(address, buf);
                }
            } catch (e) {
                err = e;
            }

            this._trans_timer = null;
            this._addMembership();
            await this._wait(200);
            callback(err);
            this._sendPacketSequentially();

        } else {
            let err = null;
            try {
                await this._sendPacket(address, buf);
            } catch (e) {
                err = e;
            }
            this._trans_timer = null;
            callback(err);
            this._sendPacketSequentially();
        }
    }

    _sendPacket(address, buf) {
        return new Promise((resolve, reject) => {
            const port = this._ip_address_utils.getPortNumber();
            try {
                this._udp.send(buf, 0, buf.length, port, address, (error, bytes) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    }

    _addMembership() {
        try {
            const netif_list = this._ip_address_utils.getNetworkInterfaceList();
            const mc_address = this._ip_address_utils.getMulticastAddress();
            for (const netif of netif_list) {
                this._udp.addMembership(mc_address, netif);
            }
        } catch (e) { console.error(e); }
    }

    _dropMembership() {
        try {
            const netif_list = this._ip_address_utils.getNetworkInterfaceList();
            const mc_address = this._ip_address_utils.getMulticastAddress();
            for (const netif of netif_list) {
                this._udp.dropMembership(mc_address, netif);
            }
        } catch (e) { console.error(e); }
    }

    _wait(msec) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve();
            }, msec);
        });
    }
}

module.exports = PacketSender;
