// คำนวณระยะทางระหว่าง 2 พิกัด (ละติจูด/ลองจิจูด) ในหน่วยเมตร
// ใช้สูตร Haversine formula

export function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // รัศมีของโลก (เมตร)
  const p1 = (lat1 * Math.PI) / 180; // แปลงองศาเป็นเรเดียน
  const p2 = (lat2 * Math.PI) / 180;
  const deltaP = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const d = R * c; // ระยะทาง (เมตร)
  return d;
}

// เช็กว่าพิกัด point [lat, lng] อยู่ใน polygon vs [[lat, lng], ...] หรือไม่
// ray-casting algorithm based on https://github.com/substack/point-in-polygon
export function isPointInPolygon(point, vs) {
  let x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i][0], yi = vs[i][1];
    let xj = vs[j][0], yj = vs[j][1];
    let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
