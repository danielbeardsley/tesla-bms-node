const { SerialPort } = require('serialport');

class SerialWrapper {
   constructor(device, speed) {
      this.device = device;
      this.speed = speed;
      this.buffer = [];
      this.readQueue = [];
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
            console.log('Error: ', err);
         });
         this.port.on('data', data => {
            this.buffer.push(...data);
            this.processReadQueue();
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

   /**
    * Let the first function in the queue know that there is data to read.
    */
   processReadQueue() {
      while (this.readQueue.length && this.buffer.length) {
         // If the reader is unhappy with the data, we will wait
         if (!this.readQueue[0]()) {
            return;
         }
         // Otherwise, we will remove the reader from the queue cause they
         // were satisfied with the data.
         this.readQueue.shift();
      }
   }

   readAll() {
      const buffer = this.buffer;
      this.buffer = [];
      return buffer;
   }

   /**
    * Return a promise that will resolve when the requested number of bytes
    * have been read. If the timeout is reached, the promise will reject.
    */
   async readBytes(numBytes, timeout = 100) {
      console.log('Reading bytes', numBytes);
      return new Promise((resolve, reject) => {
         const timeoutid =
            timeout > 0
               ? setTimeout(() => {
                    reject(new Error(`Timeout waiting for ${numBytes} bytes`));
                    this.readQueue.shift();
                 }, timeout)
               : null;
         this.readQueue.push(() => {
            if (this.buffer.length < numBytes) {
               return false;
            }
            timeoutid && clearTimeout(timeoutid);
            const buffer = this.buffer.slice(0, numBytes);
            this.buffer = this.buffer.slice(numBytes);
            resolve(buffer);
            return true;
         });
      });
   }

   flushInput() {
      this.buffer = [];
   }
}

module.exports = SerialWrapper;
