# Camp access and admin Hex Owls

Camp access is accountless. A privileged physical Hexlace grants either a `member` or `admin` role when it is claimed. The receiving browser/app generates its own random bearer key; the Worker stores only a SHA-256 hash in the `CampAccessRegistry` Durable Object. Releasing a tag or an admin revocation invalidates its grants and device keys.

## What is protected

- The complete **Admin options** panel is hidden until `GET /camp/access` confirms an active admin credential.
- Claimable camp-tag creation is rejected by the Worker unless the caller is an admin.
- Admin Hex Owl trait reads and writes require both admin camp access and the owner's private Owl profile key.
- `member` access is available to future camp-only features but does not reveal or authorize admin controls.

## One-time first-admin bootstrap

The first admin must already have My Hexlace set up and have qualified for a Hex Owl. Set a long random Worker secret without committing it:

```powershell
wrangler.cmd secret put CAMP_BOOTSTRAP_KEY
```

After deploying the Worker and Pages update, open the site on that owner's device. In the browser console run the following once, substituting the same secret entered above:

```js
await CampAccess.bootstrap("the-secret-entered-in-wrangler")
```

The endpoint also verifies the private Hexlace write key. The registry refuses a second bootstrap after the first admin exists. Remove the bootstrap secret after successful setup:

```powershell
wrangler.cmd secret delete CAMP_BOOTSTRAP_KEY
```

## Issuing access

An admin opens **My Hexlace → Admin options**, chooses **Camp member** or **Camp admin**, and creates the claimable tag. Its claim URL contains two unrelated opaque values:

- `claim` transfers ordinary Hexlace ownership through the existing seven-day contention flow.
- `camp` registers the claimant device's locally generated camp-access key with the selected role.

The role is not encoded in either token. Admins can revoke a tag through `POST /camp/access/revoke`; a management control can be added later without changing the storage model.

Camp access belongs to the claimant, not to the Owl: the existing physical-tag trade flow swaps Hexlaces and Owls but does not silently swap member/admin roles. Releasing a privileged Hexlace revokes its access; a newly issued privileged claim is required for the next owner.

## Adding access to an existing phone

Do not use the Hexlace profile handoff or rewrite anyone's NFC tag for this. On an already-authorized admin device, open **My Hexlace → Admin options**, choose **Camp member** or **Camp admin**, and create a one-use access QR. Have the recipient scan that QR in person with the phone that should receive access.

The receiving phone generates its own private bearer key and redeems the pass automatically. The regular page contains no camp-access menu, code field, or status, so visitors without verified admin access see the same interface as before. Only a phone arriving from an access QR sees the temporary redemption result.

This flow calls only `POST /camp/pairings` and `POST /camp/pairings/redeem`. It never reads, returns, or writes the receiving device's Hexlace identity, Owl profile, saved sets, friends, pings, or NFC tag. A QR expires after 10 minutes, can be redeemed by only one device key, and may be retried by that same key after a dropped response. The UI intentionally provides no copy, share, or NFC-write action so an access pass is less likely to be forwarded or overwrite a set-list tag.

## Admin Owl trait framework

Admin Owl overrides are bounded simple values stored on the existing private Hex Owl profile. Saved overrides are republished with the Owl and rendered through the renderer's validated override path. No visual parameters are registered yet.

Future trait controls register themselves without changing authorization, storage, or API routes:

```js
CampAccess.registerOwlTraits([
  { key: "palette", label: "Owl colour", type: "select", options: ["auto", "future-admin-palette"] },
  { key: "aura", label: "Aura", type: "toggle", defaultValue: false }
]);
```

Supported control types are `select`, `range`, `color`, `toggle`, and `text`. The Worker accepts at most 24 values with bounded keys and scalar string, number, boolean, or null values.
