// Ride index — collated Aug 2026 → Aug 2027, nationwide US.
// `verified: true` = details read directly from the event's own site.
// Others are compiled from published event pages/registration listings; confirm cost
// and cutoffs with the organizer before you enter. Elevation traces are illustrative
// shapes derived from each course's published profile character, not survey data.

(function(){
if (window.RIDE_EVENTS) return;
const P = {
  // profile shape generators: 32-point normalized elevation traces
  rollers: [.2,.35,.22,.44,.28,.5,.32,.55,.38,.6,.42,.58,.35,.52,.3,.48,.34,.56,.4,.62,.45,.58,.38,.5,.32,.46,.28,.4,.24,.34,.2,.26],
  bigclimb: [.1,.14,.2,.3,.44,.6,.78,.92,1,.86,.62,.4,.28,.22,.3,.46,.66,.84,.96,.8,.56,.34,.24,.34,.5,.7,.88,.7,.44,.26,.16,.1],
  lumpy: [.3,.5,.32,.6,.38,.72,.44,.66,.5,.8,.46,.7,.54,.86,.5,.74,.42,.64,.5,.78,.44,.6,.36,.56,.42,.68,.34,.52,.3,.44,.26,.32],
  flat: [.14,.18,.16,.22,.18,.24,.2,.26,.22,.28,.2,.24,.18,.26,.22,.3,.24,.28,.2,.26,.18,.22,.2,.24,.18,.2,.16,.22,.18,.2,.16,.14],
  sawtooth: [.2,.6,.25,.7,.3,.8,.35,.9,.4,.75,.3,.85,.4,.95,.45,.8,.35,.9,.5,1,.55,.85,.4,.7,.45,.8,.35,.6,.3,.5,.25,.35],
  mountain: [.08,.2,.4,.66,.9,1,.84,.6,.36,.18,.1,.16,.34,.58,.82,.96,.9,.7,.46,.26,.14,.2,.42,.68,.88,.98,.78,.5,.28,.16,.1,.06],
  steady: [.12,.2,.3,.38,.48,.56,.64,.72,.8,.88,.94,1,.92,.82,.7,.6,.66,.76,.86,.94,.86,.72,.58,.46,.38,.44,.52,.4,.3,.22,.16,.1],
};

// s: [pavement, gravel, dirt] percentages
window.RIDE_EVENTS = [
  { id:'enchanted-circle', name:'Enchanted Circle Bicycle Tour', org:'The Ride Collective', date:'2026-08-08', city:'Red River', state:'NM', lat:36.706, lon:-105.410,
    type:'road-century', dist:[85,100], gain:6200, prof:P.mountain, s:[100,0,0], cost:[135,175], deadline:'2026-08-01',
    support:5, aid:6, cutoff:'8h to Bobcat Pass base', lodging:'Red River / Angel Fire / Taos hotels; Taos County lodgers-tax supported',
    diff:4, url:'https://www.theridecollective.com/enchantedcircle', verified:true,
    blurb:'Loop of the Enchanted Circle Scenic Byway — Red River, Questa, Taos, Angel Fire, Eagle Nest, and Bobcat Pass, the highest mountain road in New Mexico. Full route support, stocked aid, music and food at the finish.' },

  { id:'sbt-grvl', name:'SBT GRVL', org:'SBT GRVL', date:'2026-08-16', city:'Steamboat Springs', state:'CO', lat:40.485, lon:-106.831,
    type:'gravel-race', dist:[37,60,100,142], gain:9200, prof:P.steady, s:[15,80,5], cost:[195,265], deadline:'2026-07-15',
    support:5, aid:7, cutoff:'14h (Black course)', lodging:'Steamboat resort town — book by spring', diff:5,
    url:'https://sbtgrvl.com', verified:false,
    blurb:'Routt County ranch roads at altitude. Four course lengths off one start, deep pro field, and the biggest expo weekend in Colorado gravel.' },

  { id:'gravel-worlds', name:'Gravel Worlds', org:'Pirate Cycling League', date:'2026-08-22', city:'Lincoln', state:'NE', lat:40.813, lon:-96.703,
    type:'gravel-race', dist:[75,150,300], gain:11000, prof:P.sawtooth, s:[5,90,5], cost:[110,185], deadline:'2026-08-10',
    support:3, aid:5, cutoff:'20h (150), 40h (300)', lodging:'Lincoln hotels + host camping at Fallbrook', diff:5,
    url:'https://gravel-worlds.com', verified:false,
    blurb:'Nebraska minimum-maintenance roads with relentless punchy climbs. Self-supported ethos with oasis-style neutral stops.' },

  { id:'vermont-overland', name:'Vermont Overland', org:'Overland Events', date:'2026-08-23', city:'Windsor', state:'VT', lat:43.478, lon:-72.388,
    type:'gravel-race', dist:[36,59], gain:7600, prof:P.lumpy, s:[20,50,30], cost:[125,165], deadline:'2026-08-09',
    support:4, aid:4, cutoff:'9h', lodging:'Windsor/Woodstock inns; on-site camping', diff:5,
    url:'https://vermontoverland.com', verified:false,
    blurb:'The original American pavé — a dozen sectors of unmaintained Class 4 Vermont road, chunky and steep, finishing at a farm party.' },

  { id:'hotter-n-hell', name:"Hotter'N Hell Hundred", org:'HHH Inc.', date:'2026-08-29', city:'Wichita Falls', state:'TX', lat:33.914, lon:-98.493,
    type:'road-century', dist:[25,50,62,100], gain:2100, prof:P.flat, s:[100,0,0], cost:[75,110], deadline:'2026-08-20',
    support:5, aid:12, cutoff:'Hell\'s Gate closes 12:30pm at mile 60', lodging:'Wichita Falls hotels + MSU dorms and tent city', diff:3,
    url:'https://www.hh100.org', verified:false,
    blurb:'North Texas in late August: 10,000+ riders, flat fast roads, and the most aid stations of any century in the country. Heat is the whole event.' },

  { id:'pan-mass', name:'Pan-Mass Challenge', org:'PMC', date:'2026-08-01', city:'Sturbridge', state:'MA', lat:42.108, lon:-72.078,
    type:'road-century', dist:[25,50,84,163,186], gain:5400, prof:P.rollers, s:[100,0,0], cost:[95,300], deadline:'2026-07-01',
    support:5, aid:9, cutoff:'Rolling; water stops close 4pm', lodging:'Bunk housing at Mass Maritime, host hotels along route', diff:3,
    url:'https://www.pmc.org', verified:false,
    blurb:'Two-day Sturbridge-to-Provincetown charity ride for Dana-Farber. Fundraising minimum applies on top of registration — the largest athletic fundraiser in the US.' },

  { id:'tour-d-athens', name:"Tour d' Αθήνα", org:'Tour de Athens', date:'2026-09-05', city:'Athens', state:'TX', lat:32.205, lon:-95.855,
    type:'road-century', dist:[23,34,56,63], gain:2900, prof:P.rollers, s:[100,0,0], cost:[40,50], deadline:'2026-08-16',
    support:4, aid:5, cutoff:'Rest stops and SAG close 4:00pm', lodging:'Athens TX motels; start/finish First United Methodist Church, 225 Lovers Ln',
    diff:2, url:'http://www.athensbikeride.com', verified:true,
    blurb:'Four routes on the backroads of East Texas, every one with a respectable amount of climbing. Packet pickup 5am, metric and 55-mile roll out 7:30am. Early-bird $40 through May 31, $45 in June–July, $50 from August. T-shirt guaranteed if registered by Aug 16.' },

  { id:'rpi', name:"Rebecca's Private Idaho", org:'RPI', date:'2026-09-05', city:'Ketchum', state:'ID', lat:43.681, lon:-114.363,
    type:'gravel-race', dist:[21,56,100,240], gain:8400, prof:P.bigclimb, s:[10,85,5], cost:[145,395], deadline:'2026-08-20',
    support:4, aid:6, cutoff:'12h (Baked Potato)', lodging:'Ketchum / Sun Valley; festival village downtown', diff:5,
    url:'https://rebeccasprivateidaho.com', verified:false,
    blurb:'Trail Creek Summit and the Copper Basin at 7,000+ ft. Four days of Queen\'s Stage racing, riding and parties in Sun Valley.' },

  { id:'tour-of-the-moon', name:'Tour of the Moon', org:'The Ride Collective', date:'2026-09-12', city:'Grand Junction', state:'CO', lat:39.064, lon:-108.551,
    type:'road-century', dist:[41,62], gain:3800, prof:P.bigclimb, s:[100,0,0], cost:[110,140], deadline:'2026-09-05',
    support:5, aid:4, cutoff:'7h', lodging:'Grand Junction / Fruita hotels', diff:3,
    url:'https://www.theridecollective.com/tourofthemoon', verified:false,
    blurb:'Colorado National Monument\'s Rim Rock Drive — tunnels, redrock canyons and the road from American Flyers. Full closure-assisted route support.' },

  { id:'cycle-oregon', name:'Cycle Oregon Classic', org:'Cycle Oregon', date:'2026-09-12', city:'Bend', state:'OR', lat:44.058, lon:-121.315,
    type:'road-century', dist:[45,70,95], gain:5600, prof:P.steady, s:[95,5,0], cost:[1150,1350], deadline:'2026-06-30',
    support:5, aid:8, cutoff:'Rolling, sweep vehicle daily', lodging:'Included: full tent-village camp, showers, meals, gear haul', diff:4,
    url:'https://www.cycleoregon.com', verified:false,
    blurb:'Seven-day fully-supported tour of rural Oregon. Price covers all meals, camping, luggage transport and mechanical — the most complete support model on this list.' },

  { id:'bwr-nc', name:'Belgian Waffle Ride North Carolina', org:'Monuments of Cycling', date:'2026-09-19', city:'Asheville', state:'NC', lat:35.595, lon:-82.551,
    type:'gravel-race', dist:[42,80,122], gain:10500, prof:P.mountain, s:[45,40,15], cost:[150,215], deadline:'2026-09-05',
    support:4, aid:6, cutoff:'12h', lodging:'Asheville / Fletcher hotels', diff:5,
    url:'https://belgianwaffleride.bike', verified:false,
    blurb:'Blue Ridge mixed-surface monster: pavement, forest service gravel and singletrack sectors, with waffles at every stop.' },

  { id:'six-gap', name:'Six Gap Century', org:'Dahlonega Wheelmen', date:'2026-09-27', city:'Dahlonega', state:'GA', lat:34.532, lon:-83.985,
    type:'road-century', dist:[54,104], gain:11200, prof:P.sawtooth, s:[100,0,0], cost:[95,120], deadline:'2026-09-13',
    support:4, aid:6, cutoff:'Hogpen Gap closes 1:30pm', lodging:'Dahlonega inns, North GA cabins', diff:5,
    url:'https://sixgapcentury.com', verified:false,
    blurb:'Six North Georgia mountain gaps including Hogpen — the benchmark hard century of the Southeast. Descent skills matter as much as climbing legs.' },

  { id:'levis-granfondo', name:"Levi's GranFondo", org:'Bike Monkey', date:'2026-10-03', city:'Santa Rosa', state:'CA', lat:38.440, lon:-122.714,
    type:'road-century', dist:[32,62,100], gain:8900, prof:P.bigclimb, s:[90,10,0], cost:[120,185], deadline:'2026-09-20',
    support:5, aid:6, cutoff:'9h', lodging:'Santa Rosa / Sebastopol; Sonoma wine-country stays', diff:4,
    url:'https://www.levisgranfondo.com', verified:false,
    blurb:'Coleman Valley to the Sonoma coast and back through the redwoods. Aid stations catered by local wineries and restaurants.' },

  { id:'rad-dirt-fest', name:'The Rad Dirt Fest', org:'Life Time', date:'2026-10-03', city:'Trinidad', state:'CO', lat:37.169, lon:-104.501,
    type:'gravel-fondo', dist:[42,72,110], gain:6100, prof:P.rollers, s:[15,80,5], cost:[135,190], deadline:'2026-09-19',
    support:4, aid:5, cutoff:'11h', lodging:'Trinidad historic downtown; Trinidad Lake camping', diff:4,
    url:'https://www.theraddirtfest.com', verified:false,
    blurb:'Southern Colorado ranchland and mesa roads out of a restored mining town. Festival-first, timing-second — comfortable place to ride your first long gravel day.' },

  { id:'athens-to-savannah', name:'Athens to Savannah Ride', org:'Georgia Hi-Lo Trail', date:'2026-10-14', endDate:'2026-10-18', city:'Athens', state:'GA', lat:33.960, lon:-83.378,
    type:'gravel-fondo', dist:[285,307], gain:9800, prof:P.rollers, s:[30,50,20], cost:[295,595], deadline:'2026-09-30',
    support:5, aid:14, cutoff:'Daily stage cutoffs, full SAG', lodging:'Camping at each stage finish or lodging partners in Greensboro, Sandersville, Statesboro, Savannah; return shuttle offered',
    diff:4, url:'https://www.athenstosavannah.com', verified:true,
    blurb:'Fundraiser for the 211-mile Georgia Hi-Lo Trail. Choose the 4-day gravel route (about 70% gravel and dirt, 30% connected pavement) or the 3-day road route, ride one day or all of them. Athens → White Plains → Tennille → Statesboro → Savannah.' },

  { id:'grinduro-ca', name:'Grinduro California', org:'Grinduro', date:'2026-10-10', city:'Quincy', state:'CA', lat:39.937, lon:-120.947,
    type:'gravel-race', dist:[60], gain:7500, prof:P.mountain, s:[35,45,20], cost:[195,240], deadline:'2026-09-26',
    support:4, aid:4, cutoff:'9h', lodging:'On-site camping at the fairgrounds included', diff:4,
    url:'https://grinduro.com', verified:false,
    blurb:'Enduro format: only four timed segments count, the rest is a group ride with a long lunch. Art show, live music and camping in the Sierra.' },

  { id:'big-sugar', name:'Big Sugar Gravel', org:'Life Time', date:'2026-10-24', city:'Bentonville', state:'AR', lat:36.372, lon:-94.209,
    type:'gravel-race', dist:[50,100], gain:8300, prof:P.sawtooth, s:[10,85,5], cost:[165,235], deadline:'2026-10-10',
    support:4, aid:5, cutoff:'12h', lodging:'Bentonville hotels; book at registration', diff:5,
    url:'https://www.bigsugarclassic.com', verified:false,
    blurb:'Ozark chert roads that eat tires — run 45mm and sealant. Punchy relentless climbing and a downtown Bentonville finish.' },

  { id:'hincapie-gf', name:'Gran Fondo Hincapie — Greenville', org:'Hincapie Events', date:'2026-10-24', city:'Travelers Rest', state:'SC', lat:34.967, lon:-82.443,
    type:'road-century', dist:[15,50,80], gain:7200, prof:P.bigclimb, s:[100,0,0], cost:[135,185], deadline:'2026-10-10',
    support:5, aid:5, cutoff:'8h', lodging:'Hotel Domestique on-site, Greenville hotels', diff:4,
    url:'https://granfondohincapie.com', verified:false,
    blurb:'Timed KOM segments up Skyuka and Green River Cove, motos and full rolling enclosure, then a finish-line festival with a chef-catered meal.' },

  { id:'el-tour-tucson', name:'El Tour de Tucson', org:'Perimeter Bicycling', date:'2026-11-21', city:'Tucson', state:'AZ', lat:32.222, lon:-110.975,
    type:'road-century', dist:[32,62,102], gain:3400, prof:P.steady, s:[100,0,0], cost:[110,165], deadline:'2026-11-07',
    support:5, aid:10, cutoff:'Mass start, 9h', lodging:'Downtown Tucson host hotels', diff:3,
    url:'https://www.perimeterbicycling.com', verified:false,
    blurb:'Sonoran desert century with 6,000+ riders and a genuine mass start. Fast, sociable, and reliably 70°F in November.' },

  { id:'old-man-winter', name:'Old Man Winter Rally', org:'Old Man Winter', date:'2027-02-14', city:'Lyons', state:'CO', lat:40.225, lon:-105.271,
    type:'gravel-fondo', dist:[20,50], gain:4200, prof:P.lumpy, s:[45,50,5], cost:[85,120], deadline:'2027-02-05',
    support:3, aid:3, cutoff:'7h', lodging:'Lyons / Boulder / Longmont', diff:3,
    url:'https://oldmanwinterrally.com', verified:false,
    blurb:'February Front Range gravel with a real chance of snow on the Left Hand and Rabbit Mountain sections. Beer and a bonfire at the finish.' },

  { id:'mid-south', name:'The Mid South', org:'District Bicycles', date:'2027-03-13', city:'Stillwater', state:'OK', lat:36.116, lon:-97.058,
    type:'gravel-race', dist:[50,100], gain:5500, prof:P.rollers, s:[5,90,5], cost:[150,200], deadline:'2027-01-15',
    support:3, aid:4, cutoff:'14h', lodging:'Stillwater hotels; sells out with the race', diff:5,
    url:'https://www.themidsouthgravel.com', verified:false,
    blurb:'Oklahoma red dirt that turns to peanut-butter mud in the rain and has ended more races than any climb. Registration is a lottery and closes months early.' },

  { id:'croatan-buck-fifty', name:'Croatan Buck Fifty', org:'Trans-Sylvania Productions', date:'2027-03-20', city:'New Bern', state:'NC', lat:35.108, lon:-77.044,
    type:'gravel-race', dist:[50,100,150], gain:1200, prof:P.flat, s:[10,80,10], cost:[95,155], deadline:'2027-03-06',
    support:3, aid:5, cutoff:'14h', lodging:'New Bern / Havelock motels', diff:3,
    url:'https://www.croatanbuckfifty.com', verified:false,
    blurb:'Dead-flat coastal forest roads through Croatan National Forest. No climbing at all, which makes it a pure wind-and-pacing test — a good first 150.' },

  { id:'barry-roubaix', name:'Barry-Roubaix', org:'Kisscross Events', date:'2027-04-17', city:'Hastings', state:'MI', lat:42.647, lon:-85.277,
    type:'gravel-race', dist:[18,36,62,100], gain:3900, prof:P.rollers, s:[20,75,5], cost:[70,130], deadline:'2027-04-01',
    support:3, aid:4, cutoff:'8h', lodging:'Hastings / Grand Rapids', diff:3,
    url:'https://barry-roubaix.com', verified:false,
    blurb:'The largest gravel road race in the world by entries — 3,000+ riders on Barry County dirt, with the Sager Road climb as the crux.' },

  { id:'bwr-ca', name:'Belgian Waffle Ride California', org:'Monuments of Cycling', date:'2027-04-17', city:'Escondido', state:'CA', lat:33.119, lon:-117.086,
    type:'gravel-race', dist:[42,82,132], gain:11000, prof:P.sawtooth, s:[50,30,20], cost:[175,250], deadline:'2027-04-03',
    support:4, aid:7, cutoff:'12h', lodging:'North County San Diego hotels', diff:5,
    url:'https://belgianwaffleride.bike', verified:false,
    blurb:'The self-styled hardest day in cycling: 40+ dirt sectors, sand, singletrack and pavement stitched together across San Diego County.' },

  { id:'bootlegger-100', name:'Bootlegger 100', org:'Bootlegger', date:'2027-04-17', city:'Lenoir', state:'NC', lat:35.914, lon:-81.539,
    type:'gravel-race', dist:[58,85], gain:9400, prof:P.mountain, s:[25,65,10], cost:[100,145], deadline:'2027-04-03',
    support:3, aid:4, cutoff:'11h', lodging:'Lenoir / Blowing Rock; camping at the venue', diff:5,
    url:'https://www.bootlegger100.com', verified:false,
    blurb:'Wilson Creek Gorge and the Pisgah escarpment — long forest-service climbs and fast rough descents in the Brushy Mountains.' },

  { id:'rasputitsa', name:'Rasputitsa', org:'Rasputitsa', date:'2027-04-24', city:'East Burke', state:'VT', lat:44.599, lon:-71.925,
    type:'gravel-fondo', dist:[42], gain:4600, prof:P.lumpy, s:[25,55,20], cost:[110,150], deadline:'2027-04-10',
    support:4, aid:3, cutoff:'8h', lodging:'Burke Mountain, Lyndonville inns', diff:4,
    url:'https://www.rasputitsagravel.com', verified:false,
    blurb:'Northeast Kingdom mud season, on purpose. Cyberia — a snowed-in Class 4 road you will walk — and an oyster-and-maple aid station.' },

  { id:'twilight-crit', name:'Athens Twilight Criterium', org:'Athens Twilight', date:'2027-04-24', city:'Athens', state:'GA', lat:33.960, lon:-83.378,
    type:'road-race', dist:[3,25], gain:400, prof:P.flat, s:[100,0,0], cost:[45,75], deadline:'2027-04-17',
    support:2, aid:0, cutoff:'80% rule / pulled at the whip', lodging:'Downtown Athens hotels — book months out', diff:4,
    url:'https://athenstwilight.com', verified:false,
    blurb:'Thirty-plus years of night criterium racing on a downtown Athens square with 30,000 spectators. Amateur fields all day, pros under lights.' },

  { id:'redlands', name:'Redlands Bicycle Classic', org:'Redlands Classic', date:'2027-04-07', endDate:'2027-04-11', city:'Redlands', state:'CA', lat:34.056, lon:-117.182,
    type:'road-race', dist:[62,75,90], gain:12000, prof:P.bigclimb, s:[100,0,0], cost:[195,275], deadline:'2027-03-20',
    support:3, aid:2, cutoff:'Time cut per stage', lodging:'Redlands / San Bernardino host hotels', diff:5,
    url:'https://redlandsclassic.com', verified:false,
    blurb:'The oldest stage race in America: a time trial, two road stages including Oak Glen, and the Sunset Loop downtown circuit. Licensed racing only.' },

  { id:'gravel-locos', name:'Gravel Locos', org:'Gravel Locos', date:'2027-05-15', city:'Hico', state:'TX', lat:31.983, lon:-98.030,
    type:'gravel-race', dist:[45,80,150], gain:6800, prof:P.rollers, s:[15,80,5], cost:[0,60], deadline:'2027-05-01',
    support:4, aid:6, cutoff:'15h', lodging:'Hico / Stephenville; free camping in town', diff:4,
    url:'https://www.gravellocos.com', verified:false,
    blurb:'Free or near-free entry by design — funded by sponsors so cost never gates the start line. Texas hill-country limestone roads out of a small downtown.' },

  { id:'iron-horse', name:'Iron Horse Bicycle Classic', org:'IHBC', date:'2027-05-29', city:'Durango', state:'CO', lat:37.275, lon:-107.880,
    type:'road-race', dist:[47,50,100], gain:6700, prof:P.steady, s:[95,5,0], cost:[105,175], deadline:'2027-05-15',
    support:4, aid:4, cutoff:'Race the train to Silverton', lodging:'Durango / Silverton; return shuttle available', diff:5,
    url:'https://ironhorsebicycleclassic.com', verified:false,
    blurb:'Durango to Silverton over Coal Bank and Molas passes, chasing the narrow-gauge steam train. Road race and tour categories on the same course.' },

  { id:'unbound', name:'Unbound Gravel', org:'Life Time', date:'2027-06-05', city:'Emporia', state:'KS', lat:38.404, lon:-96.181,
    type:'gravel-race', dist:[25,50,100,200,350], gain:11500, prof:P.sawtooth, s:[5,90,5], cost:[190,340], deadline:'2027-01-20',
    support:3, aid:4, cutoff:'21h (200), 36h (350)', lodging:'Emporia hotels sell out a year ahead; ESU dorms and camping', diff:5,
    url:'https://www.unboundgravel.com', verified:false,
    blurb:'The Flint Hills reference point — formerly Dirty Kanza, ~5,000 riders from all 50 states. Entry is by lottery; flint cuts tires and self-support between checkpoints is the rule.' },

  { id:'tulsa-tough', name:'Tulsa Tough', org:'Saint Francis Tulsa Tough', date:'2027-06-11', endDate:'2027-06-13', city:'Tulsa', state:'OK', lat:36.154, lon:-95.993,
    type:'road-race', dist:[3,35,62,100], gain:2600, prof:P.flat, s:[100,0,0], cost:[60,160], deadline:'2027-06-01',
    support:3, aid:5, cutoff:'80% rule (crits)', lodging:'Downtown Tulsa hotels', diff:4,
    url:'https://www.tulsatough.com', verified:false,
    blurb:'Three days of criteriums — including Cry Baby Hill — plus supported Gran Fondo routes each morning for non-racers.' },

  { id:'crusher', name:'Crusher in the Tushar', org:'Crusher Events', date:'2027-07-10', city:'Beaver', state:'UT', lat:38.277, lon:-112.641,
    type:'gravel-race', dist:[69], gain:10500, prof:P.mountain, s:[40,55,5], cost:[190,240], deadline:'2027-06-20',
    support:4, aid:5, cutoff:'10h', lodging:'Beaver motels, Eagle Point resort', diff:5,
    url:'https://www.tusharcrusher.com', verified:false,
    blurb:'From 6,000 to over 10,000 ft in the Tushar Mountains — the Col d\'Crush, a dirt descent, and the highest finish line in American gravel.' },

  { id:'rooted-vermont', name:'Rooted Vermont', org:'Rooted VT', date:'2027-07-25', city:'Richmond', state:'VT', lat:44.404, lon:-72.995,
    type:'gravel-fondo', dist:[46,84], gain:8100, prof:P.lumpy, s:[25,65,10], cost:[130,180], deadline:'2027-07-10',
    support:4, aid:4, cutoff:'10h', lodging:'Richmond / Burlington; on-site camping', diff:4,
    url:'https://www.rootedvermont.com', verified:false,
    blurb:'Green Mountain dirt roads with a maple creemee stop and a swim hole. Deliberately non-competitive up front, hard everywhere else.' },

  { id:'stp', name:'Seattle to Portland', org:'Cascade Bicycle Club', date:'2027-07-17', endDate:'2027-07-18', city:'Seattle', state:'WA', lat:47.606, lon:-122.332,
    type:'road-century', dist:[102,206], gain:5300, prof:P.rollers, s:[100,0,0], cost:[145,215], deadline:'2027-06-15',
    support:5, aid:11, cutoff:'One-day riders must clear midpoint by 3pm', lodging:'Midpoint camping/dorms at Centralia included in two-day option; return bus to Seattle',
    diff:3, url:'https://www.cascade.org/stp', verified:false,
    blurb:'8,000 riders, one or two days, Seattle to Portland. The best-supported long ride in the Pacific Northwest — mini-stops every 12–15 miles.' },

  { id:'ragbrai', name:'RAGBRAI', org:'Des Moines Register', date:'2027-07-24', endDate:'2027-07-31', city:'Council Bluffs', state:'IA', lat:41.262, lon:-95.861,
    type:'road-century', dist:[420,500], gain:16000, prof:P.rollers, s:[100,0,0], cost:[195,225], deadline:'2027-04-01',
    support:5, aid:20, cutoff:'Roll out by 8am each morning', lodging:'Host-town camping, charter services, school gyms; luggage hauled daily', diff:3,
    url:'https://ragbrai.com', verified:false,
    blurb:'Seven days across Iowa with 20,000+ riders and a pie stand every ten miles. Registration is a lottery in the winter; charters handle logistics.' },
];

window.RIDE_TYPES = {
  'gravel-race':   { label:'Gravel race',    short:'GRVL',  key:'A' },
  'gravel-fondo':  { label:'Gravel fondo',   short:'FONDO', key:'B' },
  'road-race':     { label:'Road race',      short:'ROAD',  key:'C' },
  'road-century':  { label:'Century / charity', short:'CENT', key:'D' },
};
})();
