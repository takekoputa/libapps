This is a port of wcwidth.js (which is a port of wcwidth implemented in C by
Markus Kuhn) to JavaScript.

Upstream details can be found in the METADATA file.

Licensing details can be found in the LICENSE.md file.

## Updating

When a new [Unicode release](https://www.unicode.org/versions/latest/) is made,
it might contain new combining and wide characters, so we'll need to update our
tables.

You'll first want to grab the latest Unicode release.  It's easiest to grab
the entire archive (it's small) and then extract the few files you want.
THe helper script can download & extract the latest files:
```
$ ./ranges.py download
```

Then use the helper script to update the tables in [wc.js](./wc.js).
```
$ ./ranges.py update
```

Now you'll double check the update to make sure things look OK.  G'luck!
