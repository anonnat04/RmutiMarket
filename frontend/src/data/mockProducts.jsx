const seller = (name, score, reviews, location = "มทร.อีสาน นครราชสีมา") => ({
  id: `seller-${name}`,
  displayName: name,
  trustScore: score,
  reviewCount: reviews,
  location,
  verificationLevel: "student_verified"
});

export const mockProducts = [
  {
    id: "p-ipad",
    title: "iPad Air 5 64GB Wi-Fi สภาพนางฟ้า ครบกล่อง",
    description: "ใช้งานเองถนอมมาก ไม่เคยตกหล่น มีเคสและสายชาร์จแท้ให้ครบ",
    price: 15900,
    isNegotiable: true,
    quantityAvailable: 1,
    condition: "like_new",
    productType: "used",
    categoryId: "cat-electronics",
    location: "มทร.อีสาน นครราชสีมา",
    timeAgo: "1 ชั่วโมงที่แล้ว",
    images: [
      { id: "i-ipad", imageUrl: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600&auto=format&fit=crop&q=80", isCover: true, sortOrder: 0 }
    ],
    status: "active",
    viewCount: 420,
    interestedCount: 38,
    seller: seller("นนท์", 4.9, 128),
    createdAt: "2026-08-31T12:00:00Z"
  },
  {
    id: "p-habits",
    title: "หนังสือ Atomic Habits เพราะชีวิตดีได้กว่าที่เป็น",
    description: "สภาพ 99% ไม่มีรอยขีดเขียน ห่อปกใสเรียบร้อย",
    price: 220,
    originalPrice: 295,
    isNegotiable: false,
    quantityAvailable: 1,
    condition: "like_new",
    productType: "used",
    categoryId: "cat-books",
    location: "มทร.อีสาน นครราชสีมา",
    timeAgo: "2 ชั่วโมงที่แล้ว",
    images: [
      { id: "i-habits", imageUrl: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=600&auto=format&fit=crop&q=80", isCover: true, sortOrder: 0 }
    ],
    status: "active",
    viewCount: 185,
    interestedCount: 16,
    seller: seller("มายด์", 4.8, 42),
    createdAt: "2026-08-31T11:00:00Z"
  },
  {
    id: "p-nike",
    title: "รองเท้า Nike Air Force 1 '07 All White (Size 42)",
    description: "ของแท้ 100% สภาพ 95% ซักทำความสะอาดแล้ว พร้อมกล่องเดิม",
    price: 2200,
    originalPrice: 3700,
    isNegotiable: true,
    quantityAvailable: 1,
    condition: "like_new",
    productType: "used",
    categoryId: "cat-fashion",
    location: "มทร.อีสาน นครราชสีมา",
    timeAgo: "3 ชั่วโมงที่แล้ว",
    images: [
      { id: "i-nike", imageUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&auto=format&fit=crop&q=80", isCover: true, sortOrder: 0 }
    ],
    status: "active",
    viewCount: 512,
    interestedCount: 44,
    seller: seller("พีท", 4.9, 65),
    createdAt: "2026-08-31T10:00:00Z"
  },
  {
    id: "p-guitar",
    title: "กีตาร์โปร่ง Yamaha F310 สภาพเยี่ยม เสียงใส",
    description: "แถมฟรีกระเป๋ากีต้าร์ ปิ๊ก และขาตั้ง สายเพิ่งเปลี่ยนใหม่",
    price: 3500,
    originalPrice: 4800,
    isNegotiable: true,
    quantityAvailable: 1,
    condition: "used_normal",
    productType: "used",
    categoryId: "cat-sports",
    location: "มทร.อีสาน นครราชสีมา",
    timeAgo: "5 ชั่วโมงที่แล้ว",
    images: [
      { id: "i-guitar", imageUrl: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=600&auto=format&fit=crop&q=80", isCover: true, sortOrder: 0 }
    ],
    status: "active",
    viewCount: 310,
    interestedCount: 29,
    seller: seller("กอล์ฟ", 4.7, 19),
    createdAt: "2026-08-31T08:00:00Z"
  },
  {
    id: "p-hoodie",
    title: "Hoodie Rmuti รุ่นพิเศษ ผ้าหนานุ่ม ลายปัก",
    description: "เสื้อฮู้ดลิขสิทธิ์สถาบัน ไซส์ XL ของใหม่ป้ายห้อย ไม่เคยใส่",
    price: 590,
    badgeText: "ใหม่",
    badgeType: "new",
    isNegotiable: false,
    quantityAvailable: 5,
    condition: "new",
    productType: "new",
    categoryId: "cat-fashion",
    location: "มทร.อีสาน นครราชสีมา",
    timeAgo: "1 วันที่แล้ว",
    images: [
      { id: "i-hoodie", imageUrl: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=600&auto=format&fit=crop&q=80", isCover: true, sortOrder: 0 }
    ],
    status: "active",
    viewCount: 680,
    interestedCount: 75,
    seller: seller("ชมรมศิษย์เก่า", 5.0, 94),
    createdAt: "2026-08-30T10:00:00Z"
  },
  {
    id: "p-laptop",
    title: "Laptop Acer Aspire 5 (Core i5 / RAM 16GB / SSD 512GB)",
    description: "สเปกทำงานและเรียน เล่นเกมเบาๆ ได้ ลื่นไหล แบตยังอึด 5 ชม.+",
    price: 12900,
    originalPrice: 15900,
    badgeText: "ลดราคา",
    badgeType: "sale",
    isNegotiable: true,
    quantityAvailable: 1,
    condition: "like_new",
    productType: "used",
    categoryId: "cat-electronics",
    location: "มทร.อีสาน นครราชสีมา",
    timeAgo: "1 วันที่แล้ว",
    images: [
      { id: "i-laptop", imageUrl: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=600&auto=format&fit=crop&q=80", isCover: true, sortOrder: 0 }
    ],
    status: "active",
    viewCount: 890,
    interestedCount: 92,
    seller: seller("บาส", 4.9, 58),
    createdAt: "2026-08-30T09:00:00Z"
  },
  {
    id: "p-fan",
    title: "พัดลมตั้งโต๊ะ USB มินิ เสียงเงียบ ปรับความแรง 3 ระดับ",
    description: "ของใหม่แกะกล่อง ประหยัดไฟ ใช้ในห้องพัก หอพักดีมาก",
    price: 199,
    originalPrice: 290,
    badgeText: "ลดราคา",
    badgeType: "sale",
    isNegotiable: false,
    quantityAvailable: 3,
    condition: "new",
    productType: "new",
    categoryId: "cat-dorm",
    location: "มทร.อีสาน นครราชสีมา",
    timeAgo: "1 วันที่แล้ว",
    images: [
      { id: "i-fan", imageUrl: "https://images.unsplash.com/photo-1618941716939-553df3c6c278?w=600&auto=format&fit=crop&q=80", isCover: true, sortOrder: 0 }
    ],
    status: "active",
    viewCount: 140,
    interestedCount: 12,
    seller: seller("พลอย", 4.7, 24),
    createdAt: "2026-08-29T14:00:00Z"
  },
  {
    id: "p-headphones",
    title: "หูฟังบลูทูธ Sony WH-CH520 ตัดเสียงรบกวน",
    description: "ใช้งาน 1 เดือน สภาพเหมือนใหม่ ประกันศูนย์เหลือ 11 เดือน",
    price: 890,
    originalPrice: 1490,
    isNegotiable: true,
    quantityAvailable: 1,
    condition: "like_new",
    productType: "used",
    categoryId: "cat-electronics",
    location: "มทร.อีสาน นครราชสีมา",
    timeAgo: "2 วันที่แล้ว",
    images: [
      { id: "i-sony", imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&auto=format&fit=crop&q=80", isCover: true, sortOrder: 0 }
    ],
    status: "active",
    viewCount: 420,
    interestedCount: 39,
    seller: seller("เจได", 5.0, 41),
    createdAt: "2026-08-28T09:00:00Z"
  }
];

export const getProductById = (id) => mockProducts.find((p) => p.id === id);

