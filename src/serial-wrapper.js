const SerialPort = require('serialport');
class SerialWrapper {
   constructor(device, speed) {
      this.device = device;
      this.speed = speed;
      this.readQueue = [];
   }

   async open() {
      return new Promise((resolve, reject) => {
         this.port = new SerialPort(this.device, { baudRate: this.speed }, err => {
            if (err) return reject(err);
            else {
               this.port.on('error', function (err) {
                  console.log('Error: ', err.message);
               });
               /*
							this.port.on('data', function (chunk) {
							  console.log('onData!')
							  // , port.read())
							})
							*/
               this.port.on(
                  'readable',
                  function () {
                     var readData;
                     readData = this.port.read();
                     this.readQueue.push(...readData);
                  }.bind(this)
               );

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
      var result = this.readQueue;
      this.readQueue = [];
      console.log('readAll: ', result);
      return result;
   }

   flushInput() {
      this.readQueue = [];
   }
}

module.exports = SerialWrapper;
