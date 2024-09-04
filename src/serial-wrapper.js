const { SerialPort } = require('serialport');

class SerialWrapper {
   constructor(device, speed) {
      this.device = device;
      this.speed = speed;
      this.readQueue = [];
   }

   async open() {
      return new Promise((resolve, reject) => {
         this.port.on('error', function (err) {
            console.log('Error: ', err.message);
         });
         this.port = new SerialPort({ path: this.device, baudRate: this.speed }, err => {
            if (err) {
               return reject(err);
            } else {
               return resolve(this);
            }
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
      let allData = [];
      while ((data = this.port.read()) !== null) {
         allData.push(...data);
      }
      return allData;
   }

   flushInput() {
      this.readQueue = [];
   }
}

module.exports = SerialWrapper;
