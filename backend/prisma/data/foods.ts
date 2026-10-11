// P11 · Curated food catalog (D29). Values are per 100 g (per 100 ml for liquids) for a typical
// home or restaurant recipe as eaten in India.
//
// SOURCE: "kimbo-curated-v1": approximate typical-recipe values compiled for Zorka. They are NOT
// copied from IFCT 2017 or INDB, and are good enough for logging but should be spot-checked before
// they are treated as reference data. Cooked dishes vary a lot by recipe; the confirm sheet and the
// oil/ghee prompt (P18) exist because of that.
//
// Row format (kept compact on purpose, one food per line):
//   [slug, name, aliases, cuisine, category, diet, kcal, protein, carbs, fat, units, flags]
//   units: space-separated "unit" or "unit:grams". The first one is the default unit. A unit
//          without grams uses DEFAULT_UNIT_GRAMS (shared/domain/food.ts). piece/serving need grams.
//   flags: "h" = home-cooked (gets the oil/ghee question), "l" = liquid (base unit ml).
//
// Diet tags use the strictest diet a typical recipe fits (D29): jain ⊂ veg ⊂ eggetarian ⊂ non_veg.
// Dishes usually made with onion, garlic or root vegetables are "veg", not "jain".

type Cuisine = "indian" | "indo_chinese" | "italian" | "continental" | "other";
type Category =
  | "home_meal"
  | "restaurant"
  | "bread"
  | "rice"
  | "protein"
  | "dairy"
  | "drink"
  | "snack"
  | "sweet"
  | "fruit"
  | "vegetable";
type Diet = "veg" | "eggetarian" | "jain" | "non_veg";

export type FoodRow = [
  slug: string,
  name: string,
  aliases: string[],
  cuisine: Cuisine,
  category: Category,
  diet: Diet,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  units: string,
  flags?: string,
];

export const FOOD_SOURCE = "kimbo-curated-v1";

export const FOODS: FoodRow[] = [
  // ── Breads ────────────────────────────────────────────────────────────────────────────────────
  ["roti", "Roti (wheat chapati)", ["roti", "chapati", "chapatti", "rotli", "fulka"], "indian", "bread", "jain", 290, 9.5, 52, 5, "piece:40", "h"],
  ["phulka", "Phulka", ["phulka roti", "dry roti"], "indian", "bread", "jain", 270, 9.6, 54, 2, "piece:30", "h"],
  ["plain-paratha", "Plain paratha", ["paratha", "lachha paratha", "tawa paratha"], "indian", "bread", "jain", 320, 7.5, 45, 12.5, "piece:75", "h"],
  ["aloo-paratha", "Aloo paratha", ["potato paratha"], "indian", "bread", "veg", 260, 5.5, 36, 10.5, "piece:120", "h"],
  ["paneer-paratha", "Paneer paratha", [], "indian", "bread", "veg", 290, 10, 32, 13.5, "piece:120", "h"],
  ["gobi-paratha", "Gobi paratha", ["cauliflower paratha"], "indian", "bread", "veg", 250, 6, 34, 10, "piece:120", "h"],
  ["methi-thepla", "Methi thepla", ["thepla"], "indian", "bread", "veg", 330, 9, 42, 14, "piece:50", "h"],
  ["puri", "Puri", ["poori"], "indian", "bread", "jain", 380, 6.5, 45, 19.5, "piece:25"],
  ["bhatura", "Bhatura", ["bhature"], "indian", "bread", "veg", 330, 7.5, 46, 13, "piece:80"],
  ["naan", "Naan", ["plain naan"], "indian", "bread", "veg", 300, 9, 51, 6.5, "piece:90"],
  ["butter-naan", "Butter naan", [], "indian", "bread", "veg", 330, 8.5, 50, 10.5, "piece:100"],
  ["garlic-naan", "Garlic naan", [], "indian", "bread", "veg", 320, 8.5, 50, 9.5, "piece:100"],
  ["tandoori-roti", "Tandoori roti", ["tandoori chapati"], "indian", "bread", "jain", 280, 9, 55, 2.5, "piece:60"],
  ["missi-roti", "Missi roti", [], "indian", "bread", "veg", 300, 11, 45, 8.5, "piece:60", "h"],
  ["makki-roti", "Makki di roti", ["makki roti", "corn roti"], "indian", "bread", "jain", 300, 6.5, 46, 10, "piece:70", "h"],
  ["bajra-roti", "Bajra roti", ["bajra bhakri", "bhakri"], "indian", "bread", "jain", 280, 8, 50, 5.5, "piece:60", "h"],
  ["jowar-roti", "Jowar roti", ["jowar bhakri"], "indian", "bread", "jain", 270, 8, 54, 2.5, "piece:50", "h"],
  ["white-bread", "White bread", ["bread", "bread slice", "sandwich bread"], "continental", "bread", "veg", 265, 9, 49, 3.2, "slice:25"],
  ["brown-bread", "Brown bread", ["whole wheat bread", "atta bread"], "continental", "bread", "veg", 250, 10, 43, 4, "slice:25"],
  ["pav", "Pav", ["pao", "bun", "ladi pav"], "indian", "bread", "veg", 280, 8.5, 52, 4, "piece:40"],
  ["butter-toast", "Butter toast", ["toast", "bread butter"], "continental", "bread", "veg", 330, 8, 44, 13, "slice:30"],

  // ── Rice and grains ───────────────────────────────────────────────────────────────────────────
  ["steamed-rice", "Steamed rice", ["rice", "white rice", "plain rice", "chawal", "boiled rice"], "indian", "rice", "jain", 130, 2.7, 28, 0.3, "katori bowl plate_full:300"],
  ["brown-rice", "Brown rice", [], "indian", "rice", "jain", 112, 2.6, 23.5, 0.9, "katori bowl"],
  ["jeera-rice", "Jeera rice", ["cumin rice"], "indian", "rice", "jain", 160, 3, 28, 4, "katori bowl plate_full:300", "h"],
  ["veg-pulao", "Veg pulao", ["pulao", "pulav", "veg pulav"], "indian", "rice", "veg", 150, 3.2, 24, 4.8, "katori bowl plate_full:300", "h"],
  ["veg-biryani", "Veg biryani", ["vegetable biryani"], "indian", "rice", "veg", 165, 3.8, 25, 5.6, "plate_full plate_half katori bowl"],
  ["chicken-biryani", "Chicken biryani", ["biryani"], "indian", "rice", "non_veg", 180, 9, 20, 7, "plate_full plate_half katori bowl"],
  ["mutton-biryani", "Mutton biryani", [], "indian", "rice", "non_veg", 200, 9.5, 19, 9.5, "plate_full plate_half katori bowl"],
  ["egg-biryani", "Egg biryani", [], "indian", "rice", "eggetarian", 170, 6.5, 22, 6.2, "plate_full plate_half katori bowl"],
  ["curd-rice", "Curd rice", ["dahi chawal", "thayir sadam"], "indian", "rice", "veg", 120, 3.5, 18, 3.5, "katori bowl"],
  ["lemon-rice", "Lemon rice", ["chitranna"], "indian", "rice", "veg", 170, 3, 28, 5, "katori bowl plate_full:250", "h"],
  ["khichdi", "Moong dal khichdi", ["khichdi", "khichri"], "indian", "rice", "jain", 125, 4.5, 20, 3, "katori bowl", "h"],
  ["pongal", "Ven pongal", ["pongal"], "indian", "rice", "veg", 150, 4.5, 20, 6, "katori bowl", "h"],
  ["poha", "Poha", ["kanda poha", "aloo poha", "pohe"], "indian", "home_meal", "veg", 180, 3.5, 30, 5.5, "plate_full:180 katori bowl", "h"],
  ["upma", "Upma", ["rava upma", "suji upma"], "indian", "home_meal", "veg", 160, 4, 24, 5.5, "plate_full:200 katori bowl", "h"],
  ["sabudana-khichdi", "Sabudana khichdi", ["sabudana"], "indian", "home_meal", "veg", 230, 2, 38, 8, "plate_full:200 katori bowl", "h"],
  ["oats-porridge", "Oats porridge with milk", ["oats", "oatmeal", "porridge"], "continental", "home_meal", "jain", 95, 4, 13.5, 2.8, "bowl"],
  ["masala-oats", "Masala oats", ["savoury oats"], "indian", "home_meal", "veg", 90, 3, 14, 2.5, "bowl", "h"],
  ["cornflakes-milk", "Cornflakes with milk", ["cornflakes", "cereal"], "continental", "home_meal", "veg", 110, 3.6, 17.5, 2.6, "bowl:180"],
  ["muesli-milk", "Muesli with milk", ["muesli"], "continental", "home_meal", "veg", 125, 4.2, 18, 3.8, "bowl:180"],

  // ── Dals and curries ──────────────────────────────────────────────────────────────────────────
  ["dal-tadka", "Dal tadka", ["dal", "daal", "toor dal", "arhar dal", "yellow dal"], "indian", "home_meal", "veg", 110, 5.8, 13.5, 3.8, "katori bowl", "h"],
  ["dal-fry", "Dal fry", [], "indian", "home_meal", "veg", 125, 6, 14, 5, "katori bowl", "h"],
  ["dal-makhani", "Dal makhani", ["maa ki dal", "kaali dal"], "indian", "home_meal", "veg", 160, 6, 14, 9, "katori bowl"],
  ["moong-dal", "Moong dal", ["yellow moong dal", "moong daal"], "indian", "home_meal", "veg", 100, 6.5, 13.5, 2.5, "katori bowl", "h"],
  ["masoor-dal", "Masoor dal", ["red lentil dal"], "indian", "home_meal", "veg", 105, 6.8, 14, 2.6, "katori bowl", "h"],
  ["chana-dal", "Chana dal", [], "indian", "home_meal", "veg", 135, 7, 17, 4.2, "katori bowl", "h"],
  ["gujarati-dal", "Gujarati dal", ["khatti meethi dal"], "indian", "home_meal", "jain", 95, 4, 13, 3, "katori bowl", "h"],
  ["sambar", "Sambar", ["sambhar"], "indian", "home_meal", "veg", 75, 3.2, 10, 2.5, "katori bowl", "h"],
  ["rasam", "Rasam", [], "indian", "home_meal", "veg", 40, 1.2, 5.5, 1.5, "katori bowl", "h"],
  ["rajma", "Rajma curry", ["rajma", "kidney beans curry", "rajma masala"], "indian", "home_meal", "veg", 140, 6.5, 16, 5.5, "katori bowl", "h"],
  ["chole", "Chole", ["chana masala", "chhole", "chickpea curry", "pindi chole"], "indian", "home_meal", "veg", 160, 7, 19, 6.5, "katori bowl", "h"],
  ["kadhi", "Kadhi pakora", ["kadhi", "kadi"], "indian", "home_meal", "veg", 115, 3.5, 9, 7.5, "katori bowl", "h"],
  ["misal", "Misal", ["misal pav usal", "usal"], "indian", "home_meal", "veg", 140, 6, 15, 6.5, "bowl katori", "h"],
  ["soya-chunks-curry", "Soya chunks curry", ["soya curry", "soyabean chunks", "nutrela"], "indian", "home_meal", "veg", 120, 10, 9, 5, "katori bowl", "h"],
  ["paneer-butter-masala", "Paneer butter masala", ["paneer makhani", "butter paneer"], "indian", "restaurant", "veg", 230, 8.5, 9, 18.5, "katori bowl plate_full:300"],
  ["palak-paneer", "Palak paneer", ["saag paneer"], "indian", "home_meal", "veg", 165, 8, 6.5, 12, "katori bowl", "h"],
  ["paneer-bhurji", "Paneer bhurji", [], "indian", "home_meal", "veg", 230, 13.5, 6, 17, "katori:115 bowl", "h"],
  ["kadai-paneer", "Kadai paneer", ["karahi paneer"], "indian", "restaurant", "veg", 200, 8.5, 8, 15, "katori bowl plate_full:300"],
  ["matar-paneer", "Matar paneer", ["mutter paneer"], "indian", "home_meal", "veg", 175, 7.5, 9, 12.5, "katori bowl", "h"],
  ["shahi-paneer", "Shahi paneer", [], "indian", "restaurant", "veg", 240, 8, 9, 19.5, "katori bowl plate_full:300"],
  ["malai-kofta", "Malai kofta", [], "indian", "restaurant", "veg", 220, 5, 13, 16.5, "katori bowl plate_full:300"],
  ["veg-korma", "Veg korma", ["navratan korma"], "indian", "restaurant", "veg", 150, 3.5, 10, 11, "katori bowl"],
  ["aloo-gobi", "Aloo gobi", ["gobi aloo"], "indian", "home_meal", "veg", 105, 2.5, 12, 5.5, "katori bowl", "h"],
  ["aloo-sabzi", "Aloo sabzi", ["aloo jeera", "potato sabzi", "bataka nu shaak", "aloo bhaji"], "indian", "home_meal", "veg", 120, 2, 17, 5, "katori bowl", "h"],
  ["dum-aloo", "Dum aloo", [], "indian", "home_meal", "veg", 150, 2.3, 15, 9, "katori bowl", "h"],
  ["bhindi-masala", "Bhindi masala", ["bhindi", "okra sabzi", "bhindi fry"], "indian", "home_meal", "veg", 110, 2.3, 9, 7.5, "katori bowl", "h"],
  ["baingan-bharta", "Baingan bharta", ["baingan", "brinjal bharta", "ringan no olo"], "indian", "home_meal", "veg", 95, 2, 8.5, 6, "katori bowl", "h"],
  ["mix-veg", "Mixed veg sabzi", ["mix veg", "mixed vegetable", "sabzi", "subzi"], "indian", "home_meal", "veg", 95, 2.5, 9, 5.5, "katori bowl", "h"],
  ["cabbage-sabzi", "Cabbage sabzi", ["patta gobi", "cabbage"], "indian", "home_meal", "veg", 80, 2, 7, 5, "katori bowl", "h"],
  ["lauki-sabzi", "Lauki sabzi", ["lauki", "dudhi", "bottle gourd"], "indian", "home_meal", "jain", 60, 1.2, 6, 3.5, "katori bowl", "h"],
  ["sarson-saag", "Sarson ka saag", ["saag"], "indian", "home_meal", "veg", 110, 3.5, 7, 7.5, "katori bowl", "h"],
  ["egg-curry", "Egg curry", ["anda curry"], "indian", "home_meal", "eggetarian", 150, 8.5, 5, 11, "katori bowl", "h"],
  ["chicken-curry", "Chicken curry", ["chicken masala", "home style chicken"], "indian", "home_meal", "non_veg", 165, 15, 4, 10, "katori bowl", "h"],
  ["butter-chicken", "Butter chicken", ["murgh makhani", "chicken makhani"], "indian", "restaurant", "non_veg", 210, 14, 6, 14.5, "katori bowl plate_full:300"],
  ["chicken-tikka-masala", "Chicken tikka masala", [], "indian", "restaurant", "non_veg", 190, 15, 6, 12, "katori bowl plate_full:300"],
  ["kadai-chicken", "Kadai chicken", ["karahi chicken"], "indian", "restaurant", "non_veg", 185, 15, 5, 12, "katori bowl plate_full:300"],
  ["mutton-curry", "Mutton curry", ["mutton masala", "goat curry", "mutton rogan josh", "rogan josh"], "indian", "home_meal", "non_veg", 200, 15, 3.5, 14, "katori bowl", "h"],
  ["keema", "Mutton keema", ["keema", "kheema", "keema matar"], "indian", "home_meal", "non_veg", 220, 16, 5, 15, "katori bowl", "h"],
  ["chicken-keema", "Chicken keema", [], "indian", "home_meal", "non_veg", 170, 17, 4, 9.5, "katori bowl", "h"],
  ["fish-curry", "Fish curry", ["machli curry", "macher jhol"], "indian", "home_meal", "non_veg", 140, 14, 3.5, 8, "katori bowl", "h"],
  ["prawn-curry", "Prawn curry", ["prawn masala", "jhinga curry"], "indian", "home_meal", "non_veg", 140, 14, 4, 7.5, "katori bowl", "h"],

  // ── Eggs, meat and protein ────────────────────────────────────────────────────────────────────
  ["boiled-egg", "Boiled egg", ["egg", "eggs", "hard boiled egg", "anda"], "other", "protein", "eggetarian", 155, 12.6, 1.1, 10.6, "piece:50"],
  ["egg-white", "Boiled egg white", ["egg whites"], "other", "protein", "eggetarian", 52, 10.9, 0.7, 0.2, "piece:33"],
  ["omelette", "Masala omelette", ["omelette", "omelet", "egg omelette"], "indian", "protein", "eggetarian", 170, 11, 2.5, 13, "piece:120", "h"],
  ["egg-bhurji", "Egg bhurji", ["anda bhurji", "scrambled egg masala"], "indian", "protein", "eggetarian", 190, 11.5, 3.5, 14.5, "katori:120", "h"],
  ["fried-egg", "Fried egg", ["egg fry", "sunny side up", "bullseye"], "other", "protein", "eggetarian", 196, 13.6, 0.8, 15, "piece:55"],
  ["scrambled-eggs", "Scrambled eggs", ["scrambled egg"], "continental", "protein", "eggetarian", 170, 11, 1.6, 13, "serving:120"],
  ["chicken-tikka", "Chicken tikka", [], "indian", "restaurant", "non_veg", 165, 24, 3, 6.5, "piece:30 plate_full:250 plate_half:150"],
  ["tandoori-chicken", "Tandoori chicken", [], "indian", "restaurant", "non_veg", 180, 23, 3, 8.5, "piece:120 plate_half:250 plate_full:500"],
  ["grilled-chicken", "Grilled chicken breast", ["chicken breast", "grilled chicken", "boiled chicken"], "continental", "protein", "non_veg", 165, 31, 0, 3.6, "piece:150 g"],
  ["chicken-65", "Chicken 65", [], "indian", "restaurant", "non_veg", 250, 18, 10, 15.5, "plate_half:150 plate_full:250"],
  ["fish-fry", "Fish fry", ["fried fish", "tawa fish"], "indian", "protein", "non_veg", 220, 20, 6, 13, "piece:80"],
  ["grilled-fish", "Grilled fish", [], "continental", "protein", "non_veg", 150, 24, 0, 6, "piece:150"],
  ["paneer", "Paneer", ["cottage cheese", "raw paneer"], "indian", "protein", "jain", 265, 18.3, 1.2, 20.8, "g piece:20 serving:100"],
  ["paneer-tikka", "Paneer tikka", [], "indian", "restaurant", "veg", 220, 14, 6, 15.5, "piece:30 plate_full:200 plate_half:120"],
  ["tofu", "Tofu", ["soya paneer"], "other", "protein", "jain", 145, 15.5, 3.5, 8.5, "g serving:100"],
  ["sprouts-salad", "Moong sprouts salad", ["sprouts", "sprout salad", "moong sprouts"], "indian", "protein", "veg", 70, 5, 11, 0.6, "katori:120 bowl:200"],
  ["boiled-chana", "Boiled kala chana", ["kala chana", "black chana", "chana chaat"], "indian", "protein", "jain", 164, 8.9, 27, 2.6, "katori:120"],
  ["whey-protein", "Whey protein (powder)", ["whey", "protein powder", "protein shake", "scoop of whey"], "other", "protein", "veg", 400, 78, 8, 6, "serving:30", ""],
  ["peanuts", "Roasted peanuts", ["peanuts", "groundnuts", "moongphali"], "indian", "snack", "jain", 585, 25, 21, 49, "serving:30 katori:100"],
  ["almonds", "Almonds", ["badam"], "other", "snack", "jain", 580, 21, 22, 50, "piece:1.2 serving:25"],
  ["peanut-butter", "Peanut butter", [], "other", "protein", "jain", 590, 25, 20, 50, "tbsp:16 tsp:5"],

  // ── Dairy ─────────────────────────────────────────────────────────────────────────────────────
  ["dahi", "Dahi (curd)", ["curd", "yogurt", "yoghurt", "dahi"], "indian", "dairy", "jain", 60, 3.2, 4.5, 3.3, "katori bowl"],
  ["greek-yogurt", "Greek yogurt", ["hung curd"], "other", "dairy", "jain", 97, 9, 4, 5, "katori:150 serving:100"],
  ["raita", "Raita", ["cucumber raita", "boondi raita"], "indian", "dairy", "veg", 55, 2.5, 4.5, 3, "katori"],
  ["cheese-slice", "Cheese slice", ["cheese"], "continental", "dairy", "veg", 300, 18, 6, 23, "slice:20"],
  ["butter", "Butter", ["makhan", "amul butter"], "other", "dairy", "jain", 717, 0.9, 0.1, 81, "tsp:5 tbsp:14"],
  ["ghee", "Ghee", ["desi ghee"], "indian", "dairy", "jain", 900, 0, 0, 100, "tsp:5 tbsp:13"],
  ["cooking-oil", "Cooking oil", ["oil", "refined oil", "mustard oil"], "other", "dairy", "jain", 884, 0, 0, 100, "tsp:5 tbsp:14"],

  // ── Drinks ────────────────────────────────────────────────────────────────────────────────────
  ["milk", "Milk (toned)", ["milk", "doodh", "toned milk", "glass of milk"], "indian", "drink", "jain", 58, 3.1, 4.7, 3, "glass cup ml", "l"],
  ["full-cream-milk", "Milk (full cream)", ["full cream milk", "whole milk"], "indian", "drink", "jain", 88, 3.2, 4.8, 6.2, "glass cup ml", "l"],
  ["chaas", "Chaas (buttermilk)", ["chaas", "chhaas", "buttermilk", "mattha", "spiced buttermilk"], "indian", "drink", "veg", 30, 1.5, 2.5, 1.4, "glass ml", "l"],
  ["sweet-lassi", "Sweet lassi", ["lassi"], "indian", "drink", "jain", 100, 3, 15, 3.2, "glass ml", "l"],
  ["masala-chai", "Masala chai", ["chai", "tea", "milk tea", "cutting chai"], "indian", "drink", "veg", 50, 1.6, 7.5, 1.6, "cup:120 ml", "l"],
  ["filter-coffee", "Coffee with milk", ["coffee", "filter coffee", "milk coffee", "cappuccino"], "indian", "drink", "jain", 55, 1.8, 7.5, 2, "cup:120 ml", "l"],
  ["black-coffee", "Black coffee", ["americano", "espresso"], "other", "drink", "jain", 2, 0.3, 0, 0, "cup ml", "l"],
  ["green-tea", "Green tea", [], "other", "drink", "jain", 1, 0, 0.2, 0, "cup ml", "l"],
  ["banana-shake", "Banana shake", ["banana milkshake"], "indian", "drink", "jain", 85, 3, 14, 2, "glass ml", "l"],
  ["coconut-water", "Coconut water", ["nariyal pani", "tender coconut"], "indian", "drink", "jain", 19, 0.7, 3.7, 0.2, "glass ml", "l"],
  ["orange-juice", "Orange juice (fresh)", ["orange juice", "juice", "mosambi juice", "sweet lime juice"], "other", "drink", "jain", 45, 0.7, 10.4, 0.2, "glass ml", "l"],
  ["sugarcane-juice", "Sugarcane juice", ["ganne ka ras"], "indian", "drink", "jain", 70, 0.2, 18, 0, "glass ml", "l"],
  ["nimbu-pani", "Nimbu pani", ["lemonade", "shikanji", "lemon water"], "indian", "drink", "jain", 25, 0, 6.5, 0, "glass ml", "l"],
  ["cola", "Cola", ["coke", "pepsi", "soft drink", "soda"], "other", "drink", "jain", 42, 0, 10.6, 0, "serving:330 glass ml", "l"],
  ["beer", "Beer", [], "other", "drink", "veg", 43, 0.5, 3.6, 0, "glass:330 serving:650 ml", "l"],
  ["protein-shake-milk", "Whey shake with milk", ["protein shake with milk"], "other", "drink", "veg", 95, 10.5, 6, 2.8, "glass ml", "l"],

  // ── Indian snacks and street food ─────────────────────────────────────────────────────────────
  ["samosa", "Samosa", [], "indian", "snack", "veg", 310, 5, 32, 18, "piece:70"],
  ["kachori", "Kachori", ["dal kachori", "khasta kachori"], "indian", "snack", "veg", 400, 7.5, 42, 22.5, "piece:50"],
  ["pakora", "Pakora", ["pakoda", "bhajiya", "bhaji", "onion pakoda"], "indian", "snack", "veg", 315, 7, 30, 18.5, "piece:20 plate_full:150"],
  ["dhokla", "Dhokla", ["khaman", "khaman dhokla"], "indian", "snack", "veg", 160, 6.5, 25, 4, "piece:30 plate_full:150"],
  ["idli", "Idli", [], "indian", "snack", "veg", 145, 4.5, 30, 0.5, "piece:40"],
  ["plain-dosa", "Plain dosa", ["dosa", "sada dosa"], "indian", "snack", "veg", 165, 4, 27, 4.5, "piece:90"],
  ["masala-dosa", "Masala dosa", [], "indian", "snack", "veg", 165, 3.8, 25, 6, "piece:200"],
  ["medu-vada", "Medu vada", ["vada", "vadai", "uddina vada"], "indian", "snack", "veg", 300, 9, 28, 17, "piece:50"],
  ["uttapam", "Uttapam", ["uthappam"], "indian", "snack", "veg", 160, 4.5, 25, 4.8, "piece:150"],
  ["coconut-chutney", "Coconut chutney", ["chutney", "nariyal chutney"], "indian", "snack", "veg", 200, 2.5, 7, 18.5, "tbsp:15 katori:50"],
  ["pav-bhaji", "Pav bhaji", [], "indian", "restaurant", "veg", 165, 4, 22, 7, "plate_full:330 plate_half:200"],
  ["vada-pav", "Vada pav", ["wada pav"], "indian", "snack", "veg", 225, 5.5, 30, 9.5, "piece:130"],
  ["pani-puri", "Pani puri", ["golgappa", "gol gappe", "puchka"], "indian", "snack", "veg", 180, 3.5, 28, 6, "piece:20 plate_full:120"],
  ["bhel-puri", "Bhel puri", ["bhel"], "indian", "snack", "veg", 175, 4.5, 30, 4.5, "plate_full:150 bowl:150"],
  ["sev-puri", "Sev puri", [], "indian", "snack", "veg", 250, 5, 30, 12, "plate_full:150 piece:25"],
  ["aloo-tikki", "Aloo tikki", ["tikki", "aloo tikki chaat"], "indian", "snack", "veg", 190, 3, 25, 9, "piece:60"],
  ["dabeli", "Dabeli", [], "indian", "snack", "veg", 230, 5, 33, 8.5, "piece:120"],
  ["khakhra", "Khakhra", [], "indian", "snack", "jain", 410, 12, 62, 12, "piece:20"],
  ["bhujia", "Namkeen (bhujia)", ["namkeen", "bhujia", "sev", "mixture", "chivda"], "indian", "snack", "veg", 540, 13, 42, 36, "serving:30 katori:60"],
  ["mathri", "Mathri", [], "indian", "snack", "jain", 520, 7, 50, 32, "piece:20"],
  ["makhana", "Roasted makhana", ["makhana", "fox nuts", "phool makhana"], "indian", "snack", "jain", 380, 9.5, 64, 9, "katori:25 serving:30"],
  ["marie-biscuit", "Marie biscuit", ["biscuit", "biscuits", "marie"], "other", "snack", "veg", 440, 7, 75, 12, "piece:7"],
  ["besan-chilla", "Besan chilla", ["chilla", "cheela", "besan cheela"], "indian", "home_meal", "veg", 190, 9, 20, 8, "piece:70", "h"],
  ["moong-chilla", "Moong dal chilla", ["moong chilla", "pesarattu"], "indian", "home_meal", "veg", 170, 9.5, 20, 6, "piece:70", "h"],
  ["papad", "Papad (roasted)", ["papad", "papadum", "appalam"], "indian", "snack", "jain", 370, 25, 59, 3.3, "piece:12"],
  ["pickle", "Pickle (achar)", ["achar", "mango pickle", "aachar"], "indian", "snack", "veg", 200, 1, 7, 18, "tsp:5 tbsp:15"],
  ["maggi", "Instant noodles", ["maggi", "instant noodles", "maggi noodles"], "other", "snack", "veg", 140, 3.5, 19, 5.6, "serving:220 bowl:220"],

  // ── Sweets ────────────────────────────────────────────────────────────────────────────────────
  ["gulab-jamun", "Gulab jamun", [], "indian", "sweet", "veg", 325, 5, 50, 12.5, "piece:40"],
  ["rasgulla", "Rasgulla", ["rosogolla"], "indian", "sweet", "veg", 185, 4, 37, 2, "piece:40"],
  ["jalebi", "Jalebi", [], "indian", "sweet", "veg", 400, 3, 65, 15, "piece:25"],
  ["kheer", "Kheer", ["rice kheer", "payasam"], "indian", "sweet", "jain", 150, 4, 21, 5.5, "katori"],
  ["gajar-halwa", "Gajar halwa", ["gajar ka halwa", "carrot halwa"], "indian", "sweet", "veg", 230, 4.5, 30, 10.5, "katori:100"],
  ["suji-halwa", "Suji halwa", ["sheera", "rava sheera", "halwa"], "indian", "sweet", "jain", 320, 4, 45, 14, "katori:100"],
  ["besan-ladoo", "Besan ladoo", ["ladoo", "laddu"], "indian", "sweet", "jain", 480, 9, 52, 27, "piece:35"],
  ["motichoor-ladoo", "Motichoor ladoo", [], "indian", "sweet", "veg", 430, 5.5, 58, 20, "piece:40"],
  ["kaju-katli", "Kaju katli", ["kaju barfi"], "indian", "sweet", "jain", 430, 8.5, 55, 20, "piece:15"],
  ["ice-cream", "Ice cream (vanilla)", ["ice cream", "icecream"], "other", "sweet", "veg", 207, 3.5, 24, 11, "serving:70 cup:100"],
  ["milk-chocolate", "Milk chocolate", ["chocolate", "dairy milk"], "other", "sweet", "veg", 535, 7.5, 59, 30, "piece:10 serving:25"],
  ["sugar", "Sugar", ["cheeni", "shakkar"], "other", "sweet", "jain", 387, 0, 100, 0, "tsp:4 tbsp:12"],
  ["honey", "Honey", ["shahad"], "other", "sweet", "veg", 304, 0.3, 82, 0, "tsp:7 tbsp:21"],
  ["jam", "Jam", ["fruit jam"], "other", "sweet", "jain", 250, 0.4, 65, 0.1, "tbsp:20 tsp:7"],

  // ── Fruits ────────────────────────────────────────────────────────────────────────────────────
  ["banana", "Banana", ["kela"], "other", "fruit", "jain", 89, 1.1, 22.8, 0.3, "piece:100"],
  ["apple", "Apple", ["seb"], "other", "fruit", "jain", 52, 0.3, 14, 0.2, "piece:170"],
  ["orange", "Orange", ["santra", "mosambi", "sweet lime"], "other", "fruit", "jain", 47, 0.9, 11.8, 0.1, "piece:130"],
  ["mango", "Mango", ["aam"], "other", "fruit", "jain", 60, 0.8, 15, 0.4, "piece:200 katori"],
  ["papaya", "Papaya", ["papita"], "other", "fruit", "jain", 43, 0.5, 11, 0.3, "katori"],
  ["watermelon", "Watermelon", ["tarbooz"], "other", "fruit", "jain", 30, 0.6, 7.6, 0.2, "katori slice:280"],
  ["grapes", "Grapes", ["angoor"], "other", "fruit", "jain", 69, 0.7, 18, 0.2, "katori"],
  ["guava", "Guava", ["amrood", "peru"], "other", "fruit", "jain", 68, 2.6, 14, 1, "piece:120"],
  ["pomegranate", "Pomegranate", ["anar"], "other", "fruit", "jain", 83, 1.7, 19, 1.2, "katori piece:200"],
  ["dates", "Dates", ["khajoor", "khajur"], "other", "fruit", "jain", 280, 2.5, 67, 0.4, "piece:8"],
  ["fruit-salad", "Fruit salad", ["mixed fruit", "fruit bowl", "fruit plate"], "other", "fruit", "jain", 55, 0.7, 14, 0.2, "katori bowl"],

  // ── Vegetables and salads ─────────────────────────────────────────────────────────────────────
  ["green-salad", "Green salad", ["salad", "kachumber", "mixed salad", "cucumber tomato salad"], "indian", "vegetable", "veg", 22, 1, 4.2, 0.2, "katori:100 bowl:150"],
  ["cucumber", "Cucumber", ["kheera", "kakdi"], "other", "vegetable", "jain", 15, 0.7, 3.6, 0.1, "piece:150"],
  ["caesar-salad", "Chicken caesar salad", ["caesar salad"], "continental", "vegetable", "non_veg", 130, 9, 5, 8.5, "bowl"],
  ["greek-salad", "Greek salad", [], "continental", "vegetable", "veg", 95, 3, 5, 7.5, "bowl"],

  // ── Indo-Chinese ──────────────────────────────────────────────────────────────────────────────
  ["veg-hakka-noodles", "Veg hakka noodles", ["hakka noodles", "veg noodles", "chowmein", "chow mein", "noodles"], "indo_chinese", "restaurant", "veg", 165, 3.8, 25, 5.5, "plate_full plate_half bowl"],
  ["chicken-hakka-noodles", "Chicken hakka noodles", ["chicken noodles", "chicken chowmein"], "indo_chinese", "restaurant", "non_veg", 175, 7.5, 22, 6.5, "plate_full plate_half bowl"],
  ["schezwan-noodles", "Schezwan noodles", ["szechuan noodles"], "indo_chinese", "restaurant", "veg", 180, 3.8, 25, 7.5, "plate_full plate_half bowl"],
  ["veg-fried-rice", "Veg fried rice", ["fried rice"], "indo_chinese", "restaurant", "veg", 165, 3.5, 27, 4.8, "plate_full plate_half bowl"],
  ["egg-fried-rice", "Egg fried rice", [], "indo_chinese", "restaurant", "eggetarian", 175, 5.5, 26, 5.5, "plate_full plate_half bowl"],
  ["chicken-fried-rice", "Chicken fried rice", [], "indo_chinese", "restaurant", "non_veg", 180, 7.5, 25, 5.8, "plate_full plate_half bowl"],
  ["veg-manchurian-gravy", "Veg manchurian (gravy)", ["manchurian", "veg manchurian", "manchurian gravy"], "indo_chinese", "restaurant", "veg", 140, 3, 14, 8, "plate_full plate_half bowl"],
  ["veg-manchurian-dry", "Veg manchurian (dry)", ["dry manchurian"], "indo_chinese", "restaurant", "veg", 220, 4.5, 22, 13, "plate_full:250 plate_half:150"],
  ["gobi-manchurian", "Gobi manchurian", [], "indo_chinese", "restaurant", "veg", 190, 3.5, 20, 11, "plate_full:250 plate_half:150"],
  ["chilli-paneer", "Chilli paneer", [], "indo_chinese", "restaurant", "veg", 230, 11, 10, 16.5, "plate_full:250 plate_half:150"],
  ["chilli-chicken", "Chilli chicken", [], "indo_chinese", "restaurant", "non_veg", 210, 15, 9, 13, "plate_full:250 plate_half:150"],
  ["veg-momos", "Veg momos (steamed)", ["momos", "momo", "veg momo", "dumplings"], "indo_chinese", "restaurant", "veg", 165, 5, 27, 4, "piece:30 plate_full:180 plate_half:120"],
  ["chicken-momos", "Chicken momos (steamed)", ["chicken momo"], "indo_chinese", "restaurant", "non_veg", 175, 9, 22, 5.5, "piece:30 plate_full:180 plate_half:120"],
  ["fried-momos", "Veg momos (fried)", ["fried momos"], "indo_chinese", "restaurant", "veg", 260, 5, 30, 13, "piece:30 plate_full:180 plate_half:120"],
  ["spring-roll", "Veg spring roll", ["spring roll", "spring rolls"], "indo_chinese", "restaurant", "veg", 250, 4.5, 28, 13, "piece:60"],
  ["manchow-soup", "Veg manchow soup", ["manchow soup", "soup"], "indo_chinese", "restaurant", "veg", 45, 1.5, 6, 1.8, "bowl", "l"],
  ["sweet-corn-soup", "Sweet corn soup", ["corn soup"], "indo_chinese", "restaurant", "veg", 60, 1.5, 11, 1.2, "bowl", "l"],

  // ── Italian ───────────────────────────────────────────────────────────────────────────────────
  ["margherita-pizza", "Margherita pizza", ["pizza", "cheese pizza"], "italian", "restaurant", "veg", 250, 11, 31, 9.5, "slice:90 piece:360"],
  ["veg-pizza", "Veg pizza (loaded)", ["veg pizza", "farmhouse pizza", "veggie pizza"], "italian", "restaurant", "veg", 240, 10, 30, 9, "slice:95 piece:380"],
  ["chicken-pizza", "Chicken pizza", ["pepperoni pizza", "bbq chicken pizza"], "italian", "restaurant", "non_veg", 265, 13, 28, 11.5, "slice:95 piece:380"],
  ["white-sauce-pasta", "White sauce pasta", ["alfredo pasta", "pasta alfredo"], "italian", "restaurant", "veg", 180, 5.5, 20, 9, "plate_full:300 bowl"],
  ["red-sauce-pasta", "Red sauce pasta", ["arrabbiata", "arrabiata pasta", "pasta", "tomato pasta"], "italian", "restaurant", "veg", 140, 4.5, 23, 3.5, "plate_full:300 bowl"],
  ["pink-sauce-pasta", "Pink sauce pasta", [], "italian", "restaurant", "veg", 160, 5, 21, 6.5, "plate_full:300 bowl"],
  ["chicken-alfredo", "Chicken alfredo pasta", ["chicken pasta"], "italian", "restaurant", "non_veg", 190, 10, 18, 8.5, "plate_full:300 bowl"],
  ["veg-lasagna", "Veg lasagna", ["lasagna", "lasagne"], "italian", "restaurant", "veg", 160, 7, 16, 7.5, "piece:250"],
  ["garlic-bread", "Garlic bread", ["cheese garlic bread"], "italian", "restaurant", "veg", 350, 8, 42, 16.5, "slice:35"],
  ["mushroom-risotto", "Mushroom risotto", ["risotto"], "italian", "restaurant", "veg", 140, 3.5, 20, 5, "plate_full:300 bowl"],
  ["bruschetta", "Bruschetta", [], "italian", "restaurant", "veg", 200, 6, 28, 7, "piece:40"],

  // ── Continental and fast food ─────────────────────────────────────────────────────────────────
  ["veg-burger", "Veg burger", ["burger", "aloo tikki burger"], "continental", "restaurant", "veg", 240, 6.5, 30, 10.5, "piece:160"],
  ["chicken-burger", "Chicken burger", [], "continental", "restaurant", "non_veg", 255, 12, 25, 12, "piece:180"],
  ["french-fries", "French fries", ["fries", "finger chips"], "continental", "restaurant", "veg", 312, 3.4, 41, 15, "serving:115 plate_full:150"],
  ["veg-sandwich", "Veg sandwich (grilled)", ["sandwich", "grilled sandwich", "bombay sandwich"], "continental", "snack", "veg", 200, 6, 28, 7.5, "piece:150"],
  ["chicken-sandwich", "Chicken sandwich", [], "continental", "snack", "non_veg", 220, 13, 22, 9, "piece:170"],
  ["mashed-potato", "Mashed potato", [], "continental", "vegetable", "veg", 105, 2, 15, 4.2, "katori bowl"],
  ["chicken-shawarma", "Chicken shawarma roll", ["shawarma", "chicken roll"], "other", "restaurant", "non_veg", 230, 12, 24, 9.5, "piece:200"],
  ["paneer-kathi-roll", "Paneer kathi roll", ["paneer roll", "paneer wrap", "kathi roll", "frankie"], "indian", "restaurant", "veg", 250, 9, 28, 11.5, "piece:180"],
  ["chicken-kathi-roll", "Chicken kathi roll", ["chicken wrap", "chicken frankie"], "indian", "restaurant", "non_veg", 240, 12, 25, 10, "piece:180"],
  ["ketchup", "Tomato ketchup", ["ketchup", "sauce"], "other", "snack", "veg", 110, 1.2, 26, 0.1, "tbsp:15 tsp:5"],
];
