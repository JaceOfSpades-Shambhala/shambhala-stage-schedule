# Camp access and customizable Hex Owls

Camp access is accountless. A privileged physical Hexlace or a one-use QR grants either a `member` or `admin` role. The receiving browser/app generates its own random bearer key; the Worker stores only a SHA-256 hash in the `CampAccessRegistry` Durable Object. Releasing a privileged tag or an admin revocation invalidates its grants and device keys.

## What is protected

- The complete **Admin options** panel is hidden until `GET /camp/access` confirms an active admin credential.
- Creating any new claimable tag is rejected by the Worker unless the caller is an admin. The default is a regular tag with no camp access.
- The Hex Owl customizer is visible to verified `member` and `admin` devices that have an Owl.
- Hex Owl trait reads and writes require camp access plus the Owl owner's private profile key, so a person can edit only their own Owl.
- `member` access does not reveal or authorize the Admin options panel.

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

## Creating new tags

An admin opens **My Hexlace -> Admin options** and chooses the access for the new claimable tag. **No camp access** is the default and creates an ordinary Hexlace. Choosing **Camp member** or **Camp admin** creates a privileged tag whose claim URL contains two unrelated opaque values:

- `claim` transfers ordinary Hexlace ownership through the existing seven-day contention flow.
- `camp` registers the claimant device's locally generated camp-access key with the selected role.

The role is not encoded in either token. Admins can revoke a tag through `POST /camp/access/revoke`; a management control can be added later without changing the storage model.

For most people, grant camp access with the one-use QR flow below and keep their NFC tag ordinary. Camp access belongs to the recipient device, not to the Owl. It reveals the otherwise-hidden Camp Hexadecibel rarity in the unified Owl customizer. Releasing a privileged Hexlace revokes its access; a newly issued privileged claim is required for the next owner.

## Adding access to an existing phone

Do not use the Hexlace profile handoff or rewrite anyone's NFC tag for this. On an already-authorized admin device, open **My Hexlace -> Admin options**, choose **Camp member** or **Camp admin**, and create a one-use access QR. Have the recipient scan that QR in person with the phone that should receive access.

The receiving phone generates its own private bearer key and redeems the pass automatically. The regular page contains no camp-access menu, code field, or status, so visitors without verified access see the same interface as before. Only a phone arriving from an access QR sees the temporary redemption result.

The redemption itself calls only `POST /camp/pairings` and `POST /camp/pairings/redeem`. It never reads, returns, or writes the receiving device's Hexlace identity, Owl profile, saved sets, friends, pings, or NFC tag. A later, explicit customizer save may change that person's Owl rarity and traits. A QR expires after 10 minutes, can be redeemed by only one device key, and may be retried by that same key after a dropped response. The UI intentionally provides no copy, share, or NFC-write action so an access pass is less likely to be forwarded or overwrite a set-list tag.

## Camp Hex Owl customizer

Verified camp members and admins see **Customize my Hex Owl** inside My Hexlace. Every Owl uses the current V4 identity contract. The page builds its dropdowns from a privileged catalogue that merges the public Common/Rare/Legendary choices with the otherwise-hidden Camp Hexadecibel rarity and UV-only traits. Visitors without verified camp access receive only the public catalogue and never see the camp tier in the page. Categories with only one possible value stay out of the form.

The editor shows the immutable original Owl beside a live preview. **Use original traits** clears every override; it does not change the Owl seed or number. Public-rarity edits retain the existing freestyle override behavior. Selecting Camp Hexadecibel keeps the seeded appearance rolling from the frozen V3 UV grammar (UV palettes, Vortex, hero floor, support cap, budget), but every dropdown stays freestyle: any enabled choice from the merged public-plus-camp catalogue applies to a camp Owl without budget, hero, or mandatory-ring restrictions. Camp-only values remain exclusive to the camp tier without being compulsory for it — public brows, eyes, beaks, markings, auras, and ring modes render on the camp frame alongside a UV colour. Leaving a dropdown on **Original** keeps the seeded choice for the Owl's current tier.

Saved choices are bounded simple values stored on the existing private Hex Owl profile and republished with that Owl. Choosing the Camp Hexadecibel rarity changes only the stored tier and selected appearance; the permanent seed, global number, mint time, and season stay intact. The Worker synchronizes the same updated Owl to its attached physical Hexlace so a tap can collect and render it. Unknown or disabled catalogue values are repaired by the renderer. The existing `/owl-admin-traits` route name remains for storage compatibility even though both camp roles may now use it. The Worker accepts at most 24 values with bounded keys and scalar string, number, boolean, or null values.

The framework also keeps an admin-only extension point for future parameters. `CampAccess.registerOwlTraits(...)` can add future dropdown definitions for admins without exposing them to members. The Worker separately limits member writes to the current renderer trait keys, so hiding a future admin control in the page is not the only protection.
