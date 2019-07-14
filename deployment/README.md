### Downloading pre-built Valetudo

You can simply download pre-built binaries of Valetudo from the [releases](https://github.com/rand256/valetudo/releases) section of the repo. If downloaded binary is compressed to .tar.gz format, you need to unpack it first.

### Acquiring sources and building Valetudo

If you wish to build Valetudo yourself, you will need a reasonably new NodeJS.
You can install this from your distro (preferred), or using one of the official
pre-compiled binaries on the node website. `pkg` is able to create armv7-binaries
on x86 (and other platforms) just fine — as long as it does not need to pre-compile
its JS bytecode. This is why we specify `--no-bytecode`.
```
git clone http://github.com/rand256/valetudo
cd valetudo
npm install
npm run build
```

Next things get a bit more complicated.

Current `pkg` version (4.4.0 and above) that we use to pack Valetudo into a single
binary file has libstdc++ library incompatible with that available in stock vacuum's
firmware. Unfortunately the last `pkg` which was compatible used node-10.4.1 binaries
that are quiet outdated and also known for issues with timers in the long run.

Thus Valetudo RE based on newer `pkg` requires to install a bit updated libstdc++ package
into the vacuum. The *.deb files needed could be found on launchpad.net
but since Ubuntu 14.04 is EOL they are slowly getting deleted from there.
The copy of suitable library (from gcc-6.2.0) is available in `deps` directory.
To install scp `*.deb`s to the vacuum and run `dpkg -i file.deb`.

Another way to deal with this issue is to manually rebuild `pkg` binaries to link
libstd++ statically. This is the way how prebuilt Valetudo binary was created here.

### Installing and configuring

When you'll get a binary named `valetudo`, you should scp it to `/usr/local/bin/` directory.

Then create `/etc/init/valetudo.conf` using the file located in `etc` directory to auto-start Valetudo.

To see maps in Valetudo you will need to prevent the robot from communicating with
Xiaomi cloud by setting up iptables and configuring the `/etc/hosts`, so that
Xiaomi hostnames were redirected locally back to Valetudo.

First add the content of `deployment/etc/hosts` to your `/etc/hosts`
file on the robot.

Second edit the `/etc/rc.local` file and add the content of
`deployment/etc/rc.local` before the `exit 0` line.

### Reboot

You can now reboot the robot.
