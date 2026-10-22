// Hand curation for the answer bands (tools/build-words.mjs). Not offensive, just poor answers: archaic,
// regional slang, odd comparatives and plurals, proper nouns in disguise, or too clinical.
export const EXCLUDE = new Set(`
  datum ditto leach lorry borne nicer safer wider women
  thous inter unset taker fiver naked roman rarer finer menus eater goody
  abler apter barer baser coyer cuter dimer direr freer gayer haler huger icier lamer laxer liker muter nuder rawer
  rifer riper ruder sager saner shyer sizer sorer surer truer viler wryer weest delis gurus kiwis saris taxis genii
  uteri radii oases fetus ovary thong booty buxom nymph harem nappy rabbi maria peter china franc fiche infix octal
  unman unsay edger letup sunup mamma ninny chink pansy papal gimme tonne karat privy mucus polio retch bawdy grope
  groin thigh obese pagan lymph
  anorak ashcan bugger cannot french guinea livest physic python racism racist racial sexist sexual virgin scotch
  tripos whilst petrol advert kidnap toilet bloody victim hatred heresy sinful smoker insane impend extant loader
  sender holder reread unread thieve pseudo
  bigger closer deeper easier fairer faster fuller harder higher larger longer louder nearer poorer richer slower
  sooner fewest finest latest lowest newest nicest oldest rarest safest widest wisest
`.trim().split(/\s+/));

// Friday and Saturday: rarer words (SCOWL 40-55) a well-read player still knows. Picked by hand.
export const HARD = `
  abash aloha artsy awash bebop bevel biker binge bloat bongo bylaw cadre catty chive chump clunk comfy condo credo
  crimp curvy decaf decal decor derby detox dicey dorky drake edify elate elfin fjord frizz funky gabby gaffe gassy
  geeky gizmo glitz golly gumbo gushy gusto gutsy heist hertz hippo hokey howdy hyper imbue jazzy kaput karma kiddo
  klutz lasso leggy legit loner macro meaty minty modem mooch nanny nerdy oldie peppy pixel plunk pooch posse promo
  pylon radon raspy rehab rerun salsa setup shush shyly silky skier slurp snafu softy spiel splay stash stilt stoic
  swank taffy tangy tarot testy tizzy trike tubby twerp unzip vegan wacky wimpy woozy wryly yucky yummy
  adder adieu agate agave alder amigo amino anime aphid argon ascot aster atoll avian axial balsa batik batty belle
  beryl bidet bilge bleep bogey borax boron bract cabal cairn calyx canto carom chomp cilia civet clomp codex combo
  conch conga copse coupe coven crone croup cubit cumin cupid deuce dingo diode divan divot dowel druid dryad ducat
  duchy dweeb egret eider ennui epoxy ester feral femur folio frump fugue futon gecko geode glyph gorse grail grebe
  grout guava haiku harpy helix henna hydra idyll ingot inset islet joist joule joust julep kazoo kebab knave knell
  kooky kudzu larch latte lemur lipid locus loopy lotto lucre macaw magma mambo manna matzo maven medic midge mocha
  mogul moray musky myrrh nacho nadir nexus ninja octet offal opine orate oxbow paean pasha patsy pilaf pinto piper
  plait pulpy quaff quasi rebus reedy renal rumba rupee sable salvo samba satay satyr scamp scone scuba sepia shale
  shard sitar skiff sloop sonar staph steed stoat sumac sushi swami swath sylph tapir taupe tibia titan tithe toady
  torte torus triad trope truss tryst tuber tulle umber usury uvula vapid venal vixen whelk whelp whiny xenon xylem
  yucca zilch zippy zonal
  ambit antsy bijou bloke caber carob celeb chard corgi croft cutie dinar dodgy expat gator grump indie
  krill mamba mezzo micro moxie oomph pesto piste prion recon remix retro rondo rowan
  runic scree scrum serif squib teddy turbo twixt wonky yikes
`.trim().split(/\s+/);
