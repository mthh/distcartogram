function distance(x1, y1, x2, y2) {
  const a = x1 - x2;
  const b = y1 - y2;
  return sqrt(a * a + b * b);
}


function point_at(coords_line, normalized_dist) {
  const a = coords_line[0];
  const b = coords_line[1];
  return [
    (b[0] - a[0]) * normalized_dist + a[0],
    (b[1] - a[1]) * normalized_dist + a[1],
  ];
};

class Mat {
  constructor(raw_csv) {
    this.cells = raw_csv.split('\n').map(line => line.split(',').map(el => (el.startsWith('"') && el.endsWith('"')) ? el.slice(1,-1) : el));
    this.ref_index = this.cells[0];
  }

  getTime(id_comm) {
    const ix = this.ref_index.map((d, i) => d === id_comm ? i : 0).reduce((a, b) => a + b);
    const times = new Map();
    for (let i = 1; i < this.cells.length; i++) {
      const value = this.cells[i][ix];
      const id = this.ref_index[i];
      times.set(id, +value);
    }
    return times;
  }

  getAvailableIds() {
    return this.ref_index.filter(a => a);
  }
}

function getImageLayer(source_geojson, mat, my_comm, factor=1) {
  const image_geojson = JSON.parse(JSON.stringify(source_geojson));
  const times = mat.getTime(my_comm);
  const my_feature = image_geojson.features.find(d => d.properties.INSEE_COM === my_comm);
  const x1 = my_feature.geometry.coordinates[0];
  const y1 = my_feature.geometry.coordinates[1];
  image_geojson.features.forEach((ft) => {
    ft.properties.time = times.get(ft.properties.INSEE_COM);
    ft.properties.distance_eucl = distance(x1, y1, ft.geometry.coordinates[0], ft.geometry.coordinates[1]);
    ft.properties.vitesse = ft.properties.distance_eucl / ft.properties.time;
  });
  const ref_vitesse = d3.median(image_geojson.features.map(d => d.properties.vitesse).filter(d => !isNaN(d)));

  image_geojson.features.forEach((ft) => {
    ft.properties.deplacement = ref_vitesse / ft.properties.vitesse;
  });
  image_geojson.features.forEach((ft) => {
    if (ft.properties.INSEE_COM === my_comm) return;
    const deplacement = 1 + (ft.properties.deplacement - 1) * factor;
    const line = [[x1, y1], ft.geometry.coordinates];
    const moved_pt = point_at(line, deplacement);
    ft.geometry.coordinates = moved_pt;
  });
  return image_geojson;
}
