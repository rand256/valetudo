### Building and installing Valetudo

For building, you need a reasonably new NodeJS. You can install this from your
distro (preferred), or using one of the official pre-compiled binaries on the
node-website …. `pkg` is able to create armv7-binaries on x86 (and other
platforms) just fine — as long as it does not need to pre-compile its JS
bytecode. This is why we specify `--no-bytecode`.
```
git clone http://github.com/rand256/valetudo
cd valetudo
npm install
npm run build
```
After that you'll find a binary named valetudo in that folder which you should scp to /usr/local/bin/

Next you need to install updated C++ library.

Current `pkg` versions (4.4.0 and above) use libstdc++ incompatible with
that available in stock vacuum's firmware. Unfortunately the last compatible pkg
includes node-10.4.1, which is known for issues with timers in the long run.

Thus Valetudo RE requires to install a bit updated libstdc++ debian package
into the vacuum. The *.deb files needed could be found on launchpad.net
but since Ubuntu 14.04 is EOL they are slowly getting deleted from there.
The copy of suitable library (from gcc-6.2.0) is available in `deps` directory.
To install scp `*.deb`s to the vacuum and run `dpkg -i file.deb`.

Create `/etc/init/valetudo.conf` using the file located in `etc` directory to auto-start Valetudo.

### Getting maps into Valetudo and preventing communication to the cloud

To see the map in Valetudo, you need to prevent the robot from communicating with
the Xiaomi cloud by setting up iptables and configuring the `/etc/hosts`, so that
xiaomi hostnames are redirected locally back to Valetudo.

First add the content of `deployment/etc/hosts` to your `/etc/hosts`
file on the robot.

Second edit the `/etc/rc.local` file and add the content of
`deployment/etc/rc.local` before the `exit 0` line.

### Reboot

You can now reboot the robot.
