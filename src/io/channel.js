// CDC 6000 12-bit input/output channel.
//
// A channel connects the PPs to the controllers. It carries two flags: "active"
// (a connection is established) and "full" (a 12-bit word is present).
// A function (FAN/FNC) is offered to each piece of equipment on the channel: the
// one that accepts it becomes the selected equipment. If none accepts it, the
// channel stays active and full ("hung" channel) until a DCN.

export const FC_ACCEPTED = 1;
export const FC_DECLINED = 0;
export const FC_PROCESSED = 2;

export class Channel {
  constructor(id) {
    this.id = id;
    this.active = false;
    this.full = false;
    this.data = 0;
    this.flag = false;
    this.devices = [];
    this.ioDevice = null;  // selected equipment
    this.hardwired = false;
    this.discAfterInput = false;
    this.delayDisconnect = 0;
    this.lastFunction = null;
    this.lastActivity = 0;
  }

  attach(device) {
    this.devices.push(device);
    device.channel = this;
    return device;
  }

  detach(device) {
    this.devices = this.devices.filter((d) => d !== device);
    if (this.ioDevice === device) this.ioDevice = null;
  }

  function(code) {
    this.full = false;
    this.lastFunction = code;
    let status = FC_DECLINED;
    for (const d of this.devices) {
      status = d.func(code);
      if (status === FC_ACCEPTED) { this.ioDevice = d; return; }
      if (status === FC_PROCESSED) { this.ioDevice = null; return; }
    }
    this.ioDevice = null;
    this.full = true;
    this.active = true;
  }

  activate() {
    this.active = true;
    if (this.ioDevice && this.ioDevice.activate) this.ioDevice.activate();
  }

  disconnect() {
    this.active = false;
    if (this.ioDevice) {
      if (this.ioDevice.disconnect) this.ioDevice.disconnect();
    } else {
      this.full = false;
    }
  }

  /** Lets the selected equipment exchange one word with the channel. */
  io() {
    if ((this.active || this.alwaysActive) && this.ioDevice && this.ioDevice.io) this.ioDevice.io();
  }

  step() {
    if (this.delayDisconnect) {
      this.delayDisconnect--;
      if (!this.delayDisconnect) {
        this.active = false;
        this.discAfterInput = false;
      }
    }
  }
}

/** Equipment base class. */
export class Device {
  constructor(name) {
    this.name = name;
    this.channel = null;
    this.fcode = 0;
  }
  func() { return FC_DECLINED; }
  activate() {}
  disconnect() {}
  io() {}
  /** Called every simulated microsecond (devices with delays). */
  tick() {}
  reset() {}
}
