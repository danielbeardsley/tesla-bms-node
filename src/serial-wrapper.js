const { SerialPort } = require('serialport');

class SerialWrapper {
   constructor(device, speed) {
      this.device = device;
      this.speed = speed;
      this.buffer = [];
   }

   async open() {
      return new Promise((resolve, reject) => {
         this.port = new SerialPort({ path: this.device, baudRate: this.speed }, err => {
            if (err) {
               return reject(err);
            } else {
               return resolve(this);
            }
         });
         this.port.on('error', function (err) {
            console.log('Error: ', err.message);
         });
         this.port.on('readable', () => {
            const data = this.port.read();
            this.buffer.push(...data)
         });
      });
   }

   close() {
      this.port.close();
   }

   async write(buffer) {
      return new Promise((resolve, reject) => {
         this.port.write(buffer, '', err => {
            if (err) reject(err);
            else {
               this.port.drain(error => {
                  if (err) reject(err);
                  else resolve();
               });
            }
         });
      });
   }

   readAll() {
      const buffer = this.buffer;
      this.buffer = [];
      return buffer;
   }


   flushInput() {
      this.buffer = [];
   }
}

module.exports = SerialWrapper;
