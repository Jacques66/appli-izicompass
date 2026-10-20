// Canal d'entrée/sortie 12 bits du CDC 6000.
//
// Un canal relie les PP aux contrôleurs. Il porte deux indicateurs : « actif »
// (une connexion est établie) et « plein » (un mot de 12 bits est présent).
// Une fonction (FAN/FNC) est offerte à chaque équipement du canal : celui qui
// l'accepte devient l'équipement sélectionné. Si aucun ne l'accepte, le canal
// reste actif et plein (canal « suspendu ») jusqu'à un DCN.

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
    this.ioDevice = null;  // équipement sélectionné
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

  /** Laisse l'équipement sélectionné échanger un mot avec le canal. */
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

/** Classe de base des équipements. */
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
  /** Appelé à chaque microseconde simulée (périphériques à délais). */
  tick() {}
  reset() {}
}
