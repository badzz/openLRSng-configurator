var PSP = {
    packet_state: 0,
    command: 0,
    message_crc: 0,
    message_length_expected: 0,
    message_length_received: 0,
    message_buffer: undefined,
    message_buffer_uint8_view: undefined,

    callbacks: [],

    // commands
    PSP_SYNC1:                      0xB5,
    PSP_SYNC2:                      0x62,

    PSP_REQ_BIND_DATA:              1,
    PSP_REQ_RX_CONFIG:              2,
    PSP_REQ_RX_JOIN_CONFIGURATION:  3,
    PSP_REQ_SCANNER_MODE:           4,
    PSP_REQ_SPECIAL_PINS:           5,
    PSP_REQ_FW_VERSION:             6,
    PSP_REQ_NUMBER_OF_RX_OUTPUTS:   7,
    PSP_REQ_ACTIVE_PROFILE:         8,
    PSP_REQ_RX_FAILSAFE:            9,
    PSP_REQ_TX_CONFIG:              10,
    PSP_REQ_PPM_IN:                 11,

    PSP_SET_BIND_DATA:              101,
    PSP_SET_RX_CONFIG:              102,
    PSP_SET_TX_SAVE_EEPROM:         103,
    PSP_SET_RX_SAVE_EEPROM:         104,
    PSP_SET_TX_RESTORE_DEFAULT:     105,
    PSP_SET_RX_RESTORE_DEFAULT:     106,
    PSP_SET_ACTIVE_PROFILE:         107,
    PSP_SET_RX_FAILSAFE:            108,
    PSP_SET_TX_CONFIG:              109,

    PSP_SET_EXIT:                   199,

    PSP_INF_ACK:                    201,
    PSP_INF_REFUSED:                202,
    PSP_INF_CRC_FAIL:               203,
    PSP_INF_DATA_TOO_LONG:          204,

    callbacks_cleanup: function() {
        for (var i = 0; i < this.callbacks.length; i++) {
            clearTimeout(this.callbacks[i].timer);
        }

        this.callbacks = [];
    },

    disconnect_cleanup: function() {
        this.packet_state = 0; // reset packet state for "clean" initial entry (this is only required if user hot-disconnects)

        this.callbacks_cleanup();
    }
};

PSP.read = function(readInfo) {
    var data = new Uint8Array(readInfo.data);

    for (var i = 0; i < data.length; i++) {
        switch (this.packet_state) {
            case 0:
                if (data[i] == this.PSP_SYNC1) {
                    this.packet_state++;
                }
                break;
            case 1:
                if (data[i] == this.PSP_SYNC2) {
                    this.packet_state++;
                } else {
                    this.packet_state = 0; // Restart and try again
                }
                break;
            case 2: // command
                this.command = data[i];
                this.message_crc = data[i];

                this.packet_state++;

                break;
            case 3: // payload length LSB
                this.message_length_expected = data[i];
                this.message_crc ^= data[i];

                this.packet_state++;
                break;
            case 4: // payload length MSB
                this.message_length_expected |= data[i] << 8;
                this.message_crc ^= data[i];

                // setup arraybuffer
                this.message_buffer = new ArrayBuffer(this.message_length_expected);
                this.message_buffer_uint8_view = new Uint8Array(this.message_buffer);

                this.packet_state++;
                break;
            case 5: // payload
                this.message_buffer_uint8_view[this.message_length_received] = data[i];
                this.message_crc ^= data[i];
                this.message_length_received++;

                if (this.message_length_received >= this.message_length_expected) {
                    this.packet_state++;
                }
            break;
            case 6:
                if (this.message_crc == data[i]) {
                    // message received, process
                    this.process_data(this.command, this.message_buffer, this.message_length_expected);
                } else {
                    // crc failed
                    console.log('crc failed, command: ' + this.command);
                    GUI.log(chrome.i18n.getMessage('error_psp_crc_failed', [this.command]));

                    // unlock disconnect button (this is a special case)
                    GUI.connect_lock = false;
                }

                // Reset variables
                this.message_length_received = 0;
                this.packet_state = 0;

                break;
        }
    }
};

PSP.process_data = function(command, message_buffer, message_length) {
    var data = new DataView(message_buffer, 0); // DataView (allowing us to view arrayBuffer as struct/union)

    switch (command) {
        case PSP.PSP_REQ_BIND_DATA:
            BIND_DATA.version = data.getUint8(0);
            BIND_DATA.serial_baudrate = data.getUint32(1, 1);
            BIND_DATA.rf_frequency = data.getUint32(5, 1);
            BIND_DATA.rf_magic = data.getUint32(9, 1);
            BIND_DATA.rf_power = data.getUint8(13);
            BIND_DATA.rf_channel_spacing = data.getUint8(14);

            for (var i = 0; i < 24; i++) {
                BIND_DATA.hopchannel[i] =  data.getUint8(15 + i);
            }

            BIND_DATA.modem_params = data.getUint8(39);
            BIND_DATA.flags = data.getUint8(40);

			BIND_DATA.serial_downlink = data.getUint8(41);
            GUI.log(chrome.i18n.getMessage('bind_data_received'));
            break;
        case PSP.PSP_REQ_RX_CONFIG:
            RX_CONFIG.rx_type = data.getUint8(0);

            for (var i = 0; i < 13; i++) {
                RX_CONFIG.pinMapping[i] = data.getUint8(1 + i);
            }

            RX_CONFIG.flags = data.getUint8(14);
            RX_CONFIG.RSSIpwm = data.getUint8(15);
            RX_CONFIG.beacon_frequency = data.getUint32(16, 1);
            RX_CONFIG.beacon_deadtime = data.getUint8(20);
            RX_CONFIG.beacon_interval = data.getUint8(21);
            RX_CONFIG.minsync = data.getUint16(22, 1);
            RX_CONFIG.failsafe_delay = data.getUint8(24);
            RX_CONFIG.ppmStopDelay = data.getUint8(25);
            RX_CONFIG.pwmStopDelay = data.getUint8(26);

            GUI.log(chrome.i18n.getMessage('receiver_config_data_received'));
            break;
        case PSP.PSP_REQ_RX_JOIN_CONFIGURATION:
            break;
        case PSP.PSP_REQ_SCANNER_MODE:
            break;
        case PSP.PSP_REQ_SPECIAL_PINS:
            var bytes = message_buffer.byteLength;

            RX_SPECIAL_PINS = []; // drop previous array

            for (var i = 0; i < bytes; i += 2) {
                var object = {'pin': data.getUint8(i), 'type': data.getUint8(i + 1)};
                RX_SPECIAL_PINS.push(object);
            }
            break;
        case PSP.PSP_REQ_FW_VERSION:
            firmware_version = data.getUint16(0, 1);
            var crunched_firmware = read_firmware_version(firmware_version);

            GUI.log(chrome.i18n.getMessage('transmitter_firmware_version', [crunched_firmware.str]));

            // change connect/disconnect button from "connecting" status to disconnect
            $('div#port-picker a.connect').text(chrome.i18n.getMessage('disconnect')).addClass('active');

            // if first 2 version numbers match, we will let the user enter
            if (crunched_firmware.first == firmware_version_accepted[0] && crunched_firmware.second == firmware_version_accepted[1]) {
                PSP.send_message(PSP.PSP_REQ_TX_CONFIG, false, false, get_active_profile);

                function get_active_profile() {
                    PSP.send_message(PSP.PSP_REQ_ACTIVE_PROFILE, false, false, get_bind_data);
                }

                function get_bind_data() {
                    PSP.send_message(PSP.PSP_REQ_BIND_DATA, false, false, ready_to_start);
                }

                function ready_to_start() {
                    GUI.lock_all(0); // unlock all tabs
                    GUI.operating_mode = 1; // we are connected

                    // open TX tab
                    $('#tabs li a:first').click();
                }

                if (crunched_firmware.third != firmware_version_accepted[2]) {
                    GUI.log(chrome.i18n.getMessage('firmware_minor_version_mismatch'));
                }
            } else {
                GUI.log(chrome.i18n.getMessage('firmware_major_version_mismatch'));
                $('div#port-picker a.connect').click(); // reset the connect button back to "disconnected" state
            }
            break;
        case PSP.PSP_REQ_NUMBER_OF_RX_OUTPUTS:
            numberOfOutputsOnRX = data.getUint8(0);
            break;
        case PSP.PSP_REQ_ACTIVE_PROFILE:
            activeProfile = data.getUint8(0);
            break;
        case PSP.PSP_REQ_RX_FAILSAFE:
            // dump previous data
            RX_FAILSAFE_VALUES = [];

            if (message_length > 1) {
                // valid failsafe values received (big-endian)
                GUI.log(chrome.i18n.getMessage('receiver_failsafe_data_received'));

                for (var i = 0; i < message_length; i += 2) {
                    RX_FAILSAFE_VALUES.push(data.getUint16(i, 0));
                }
            } else if (message_length == 1) {
                // 0x01 = failsafe not set
                GUI.log(chrome.i18n.getMessage('receiver_failsafe_data_not_saved_yet'));

                for (var i = 0; i < 16; i++) {
                    RX_FAILSAFE_VALUES.push(1000);
                }
            } else {
                // 0x00 = call failed
            }
            break;
        case PSP.PSP_REQ_TX_CONFIG:
            TX_CONFIG.rfm_type = data.getUint8(0);
            TX_CONFIG.max_frequency = data.getUint32(1, 1);
            TX_CONFIG.flags = data.getUint32(5, 1);
            break;
        case PSP.PSP_REQ_PPM_IN:
            PPM.ppmAge = data.getUint8(0);
            for (var i = 0, needle = 1; needle < message_length - 1; i++, needle += 2) {
                PPM.channels[i] = data.getUint16(needle, 1);
            }
            break;
        case PSP.PSP_SET_BIND_DATA:
            if (data.getUint8(0)) {
                GUI.log(chrome.i18n.getMessage('transmitter_bind_data_sent_ok'));
            } else {
                GUI.log(chrome.i18n.getMessage('transmitter_bind_data_sent_fail'));
            }
            break;
        case PSP.PSP_SET_RX_CONFIG:
            if (data.getUint8(0)) {
                GUI.log(chrome.i18n.getMessage('receiver_config_data_sent_ok'));
            } else {
                GUI.log(chrome.i18n.getMessage('receiver_config_data_sent_fail'));
            }
            break;
        case PSP.PSP_SET_TX_SAVE_EEPROM:
            if (data.getUint8(0)) {
                GUI.log(chrome.i18n.getMessage('transmitter_eeprom_save_ok'));
            } else {
                GUI.log(chrome.i18n.getMessage('transmitter_eeprom_save_fail'));
            }
            break;
        case PSP.PSP_SET_RX_SAVE_EEPROM:
            if (data.getUint8(0)) {
                GUI.log(chrome.i18n.getMessage('receiver_eeprom_save_ok'));
            } else {
                GUI.log(chrome.i18n.getMessage('receiver_eeprom_save_fail'));
            }
            break;
        case PSP.PSP_SET_TX_RESTORE_DEFAULT:
            GUI.log(chrome.i18n.getMessage('transmitter_configuration_restored'));
            break;
        case PSP.PSP_SET_RX_RESTORE_DEFAULT:
            GUI.log(chrome.i18n.getMessage('receiver_configuration_restored'));
            break;
        case PSP.PSP_SET_ACTIVE_PROFILE:
            break;
        case PSP.PSP_SET_RX_FAILSAFE:
            if (data.getUint8(0)) {
                GUI.log(chrome.i18n.getMessage('receiver_failsafe_data_save_ok'));
            } else {
                GUI.log(chrome.i18n.getMessage('receiver_failsafe_data_save_fail'));
            }
            break;
        case PSP.PSP_SET_TX_CONFIG:
            if (data.getUint8(0)) {
                console.log('TX_config saved');
            } else {
                console.log('TX_config not saved');
            }
            break;
        case PSP.PSP_SET_EXIT:
            break;

        default:
            console.log('Unknown command: ' + command);
            GUI.log(chrome.i18n.getMessage('error_psp_unknown_code', [command]));
    }

    // trigger callbacks, cleanup/remove callback after trigger
    for (var i = this.callbacks.length - 1; i >= 0; i--) { // itterating in reverse because we use .splice which modifies array length
        if (this.callbacks[i].code == command) {
            // save callback reference
            var callback = this.callbacks[i].callback;

            // remove timeout
            if (this.callbacks[i].timeout) clearTimeout(this.callbacks[i].timer);

            // remove object from array
            this.callbacks.splice(i, 1);

            // fire callback
            if (callback) callback({'command': command, 'data': data, 'length': message_length});
        }
    }
};

PSP.send_message = function(code, data, callback_sent, callback_psp, timeout) {
    var self = this;
    var bufferOut;
    var bufView;

    // always reserve 6 bytes for protocol overhead !
    if (typeof data === 'object') {
        var size = data.length + 6;
        var checksum = 0;

        bufferOut = new ArrayBuffer(size);
        bufView = new Uint8Array(bufferOut);

        bufView[0] = PSP.PSP_SYNC1;
        bufView[1] = PSP.PSP_SYNC2;
        bufView[2] = code;
        bufView[3] = lowByte(data.length);
        bufView[4] = highByte(data.length);

        checksum = bufView[2] ^ bufView[3] ^ bufView[4];

        for (var i = 0; i < data.length; i++) {
            bufView[i + 5] = data[i];
            checksum ^= bufView[i + 5];
        }

        bufView[5 + data.length] = checksum;
    } else {
        bufferOut = new ArrayBuffer(7);
        bufView = new Uint8Array(bufferOut);

        bufView[0] = PSP.PSP_SYNC1;
        bufView[1] = PSP.PSP_SYNC2;
        bufView[2] = code;
        bufView[3] = 0x01; // payload length LSB
        bufView[4] = 0x00; // payload length MSB
        bufView[5] = data;
        bufView[6] = bufView[2] ^ bufView[3] ^ bufView[4] ^ bufView[5]; // crc
    }

    // define PSP callback for next command
    if (callback_psp) {
        var obj;

        if (timeout) {
            obj = {'code': code, 'callback': callback_psp, 'timeout': timeout};
            obj.timer = setTimeout(function() {
                // fire callback
                callback_psp(false);

                // remove object from array
                var index = self.callbacks.indexOf(obj);
                if (index > -1) self.callbacks.splice(index, 1);
            }, timeout);
        } else {
            obj = {'code': code, 'callback': callback_psp, 'timeout': false};
        }

        this.callbacks.push(obj);
    }

    serial.send(bufferOut, function(writeInfo) {
        if (writeInfo.bytesSent == bufferOut.byteLength) {
            if (callback_sent) {
                callback_sent();
            }
        }
    });
};

function send_TX_config(callback) {
    // tx_config data crunch
    var tx_config = new ArrayBuffer(9); // size must always match the struct size on the mcu, otherwise transmission will fail!
    var view = new DataView(tx_config, 0);

    view.setUint8(0, TX_CONFIG.rfm_type);
    view.setUint32(1, TX_CONFIG.max_frequency, 1);
    view.setUint32(5, TX_CONFIG.flags, 1);

    // bind_data data crunch
    var bind_data = new ArrayBuffer(42); // size must always match the struct size on the mcu, otherwise transmission will fail!
    var view = new DataView(bind_data, 0);
    var needle = 0;

    view.setUint8(needle++, BIND_DATA.version);
    view.setUint32(needle, BIND_DATA.serial_baudrate, 1);
    needle += 4;
    view.setUint32(needle, BIND_DATA.rf_frequency, 1);
    needle += 4;
    view.setUint32(needle, BIND_DATA.rf_magic, 1);
    needle += 4;
    view.setUint8(needle++, BIND_DATA.rf_power);
    view.setUint8(needle++, BIND_DATA.rf_channel_spacing);

    for (var i = 0; i < 24; i++) {
        view.setUint8(needle++, BIND_DATA.hopchannel[i]);
    }

    view.setUint8(needle++, BIND_DATA.modem_params);
    view.setUint8(needle++, BIND_DATA.flags);
	view.setUint8(needle++, BIND_DATA.serial_downlink);

    // 8 bit arrays ready for sending
    var tx_data = new Uint8Array(tx_config);
    var bind_data = new Uint8Array(bind_data);

    PSP.send_message(PSP.PSP_SET_TX_CONFIG, tx_data, false, send_bind_data);

    function send_bind_data() {
        PSP.send_message(PSP.PSP_SET_BIND_DATA, bind_data, false, save_eeprom);
    }

    function save_eeprom() {
        PSP.send_message(PSP.PSP_SET_TX_SAVE_EEPROM, false, false, (callback) ? callback : undefined);
    }
}

function send_RX_config(callback) {
    var RX_config = new ArrayBuffer(27); // size must always match the struct size on the mcu, otherwise transmission will fail!
    var view = new DataView(RX_config, 0);
    var needle = 0;

    view.setUint8(needle++, RX_CONFIG.rx_type);

    for (var i = 0; i < 13; i++) {
        view.setUint8(needle++, RX_CONFIG.pinMapping[i]);
    }

    view.setUint8(needle++, RX_CONFIG.flags);
    view.setUint8(needle++, RX_CONFIG.RSSIpwm);
    view.setUint32(needle, RX_CONFIG.beacon_frequency, 1);
    needle += 4;
    view.setUint8(needle++, RX_CONFIG.beacon_deadtime);
    view.setUint8(needle++, RX_CONFIG.beacon_interval);
    view.setUint16(needle, RX_CONFIG.minsync, 1);
    needle += 2;
    view.setUint8(needle++, RX_CONFIG.failsafe_delay);
    view.setUint8(needle++, RX_CONFIG.ppmStopDelay);
    view.setUint8(needle++, RX_CONFIG.pwmStopDelay);

    var data = new Uint8Array(RX_config);

    PSP.send_message(PSP.PSP_SET_RX_CONFIG, data, false, save_to_eeprom);

    function save_to_eeprom() {
        PSP.send_message(PSP.PSP_SET_RX_SAVE_EEPROM, false, false, (callback) ? callback : undefined);
    }
}