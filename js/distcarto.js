const sqrt = Math.sqrt;
const ceil = Math.ceil;
const pow = Math.pow;
const max = Math.max;

class Node {
  constructor(i, j, src=null) {
    this.weight = 0;
    this.i = i;
    this.j = j;
    this.source = src;
    this.interp = null;
  }
}

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  to_xy() {
    return [this.x, this.y];
  }

  distance(other) {
    const a = this.x - other.x;
    const b = this.y - other.y;
    return sqrt(a * a + b * b);
  }
}

class Rectangle2D {
  constructor(height, width, x, y) {
    this.height = height;
    this.width = width;
    this.x = x;
    this.y = y;
  }

  add(pt) {
    if (pt.x < this.x) {
      this.x = pt.x;
    }
    if (pt.y < this.y) {
      this.y = pt.y;
    }
    let tx = pt.x - this.x;
    let ty = pt.y - this.y;
    if (tx > this.width) {
      this.width = tx;
    }
    if (ty > this.height) {
      this.height = ty;
    }
  }
}

class Grid {
  constructor(points, precision, rect=null) {
    const nb_pts = points.length;
    this.points = points;
    if (!rect) {
      rect = getBoundingRect(points);
    }
    this.rect_width = rect[2] - rect[0];
    this.rect_height = rect[3] - rect[1];
    this.resolution = 1 / precision * sqrt(this.rect_width * this.rect_height / nb_pts);
    this.width = ceil(this.rect_width / this.resolution) + 1;
    this.height = ceil(this.rect_height / this.resolution) + 1;
    this.dx = this.width * this.resolution - this.rect_width;
    this.dy = this.height * this.resolution - this.rect_height;
    rect[0] = rect[0] - this.dx / 2;
    rect[1] = rect[1] - this.dy / 2;
    rect[2] = rect[2] + this.dx / 2;
    rect[3] = rect[3] + this.dy / 2;
    this.rect_width = rect[2] - rect[0];
    this.rect_height = rect[3] - rect[1];
    this.width += 1;
    this.height += 1;
    this.min_x = rect[0];
    this.max_y = rect[3];
    this.nodes = [];
    for (let i = 0; i < this.height; i++) {
      for (let j = 0; j < this.width; j++) {
        this.nodes.push(
          new Node(i, j, new Point(
            this.min_x + j * this.resolution,
            this.max_y - i * this.resolution)));
      }
    }
    for (let ix = 0; ix < nb_pts; ix++) {
      const adj_nodes = this.get_adj_nodes(points[ix]);
      for (let i = 0; i < adj_nodes.length; i++) {
        adj_nodes[i].weight += 1;
      }
    }
  }

  get_node(i, j) {
    if (i < 0 || j < 0 || i >= this.height || j >= this.width) {
      return null;
    }
    return this.nodes[i * this.width + j];
  }

  get_i(pt) {
    return ((this.max_y - pt.y) / this.resolution) | 0;
  }

  get_j(pt) {
    return ((pt.x - this.min_x) / this.resolution) | 0;
  }

  get_adj_nodes(point) {
    const i = this.get_i(point);
    const j = this.get_j(point);
    return [
      this.get_node(i, j),
      this.get_node(i, j + 1),
      this.get_node(i + 1, j),
      this.get_node(i + 1, j + 1),
    ];
  }

  get_interp_point(src_point) {
    const adj_nodes = this.get_adj_nodes(src_point);
    const resolution = this.resolution;
    const ux1 = src_point.x - adj_nodes[0].source.x;
    const vy1 = src_point.y - adj_nodes[2].source.y;
    const hx1 = ux1 / resolution * (
      adj_nodes[1].interp.x - adj_nodes[0].interp.x) + adj_nodes[0].interp.x;
    const hx2 = ux1 / resolution * (
      adj_nodes[3].interp.x - adj_nodes[2].interp.x) + adj_nodes[2].interp.x;
    const HX = vy1 / resolution * (hx1 - hx2) + hx2;
    const hy1 = ux1 / resolution * (
      adj_nodes[1].interp.y - adj_nodes[0].interp.y) + adj_nodes[0].interp.y;
    const hy2 = ux1 / resolution * (
      adj_nodes[3].interp.y - adj_nodes[2].interp.y) + adj_nodes[2].interp.y;
    const HY = vy1 / resolution * (hy1 - hy2) + hy2;
    return new Point(HX, HY);
  }

  interpolate(img_points, nb_iter) {
    const nb_pts = img_points.length;
    for (let i = 0; i < this.nodes.length; i++) {
      this.nodes[i].interp = new Point(this.nodes[i].source.x, this.nodes[i].source.y);
    }

    const rect = new Rectangle2D(0, 0, Infinity, Infinity);
    const rect_adj = new Rectangle2D(0, 0, Infinity, Infinity);

    for (let i = 0; i < nb_pts; i++) {
      rect.add(this.points[i]);
      rect_adj.add(img_points[i]);
    }

    this.scaleX = rect_adj.width / rect.width;
    this.scaleY = rect_adj.height / rect.height;
    const resolution = this.resolution;
    const width = this.width;
    const height = this.height;
    const rect_dim = this.rect_width * this.rect_height;
    let ux1, ux2, vy1, vy2, u, v, w, qx, qy, deltaZx, deltaZy, sQx, sQy, sW;
    let hx1, hx2, HX, hy1, hy2, HY;
    let dx, dy, deltaX, deltaY, adjX, adjY;
    let p_tmp, _p, n, delta;
    for (let k = 0; k < nb_iter; k++) {
      for (let ix = 0; ix < nb_pts; ix++) {
        const src_pt = this.points[ix];
        const adj_pt = img_points[ix];
        const adj_nodes = this.get_adj_nodes(src_pt);
        const smoothed_nodes = [
          this.get_smoothed(adj_nodes[0].i, adj_nodes[0].j),
          this.get_smoothed(adj_nodes[1].i, adj_nodes[1].j),
          this.get_smoothed(adj_nodes[2].i, adj_nodes[2].j),
          this.get_smoothed(adj_nodes[3].i, adj_nodes[3].j)
        ];

        ux1 = src_pt.x - adj_nodes[0].source.x;
        ux2 = resolution - ux1;
        vy1 = src_pt.y - adj_nodes[2].source.y;
        vy2 = resolution - vy1;

        u = 1 / (ux1*ux1 + ux2*ux2);
        v = 1 / (vy1*vy1 + vy2*vy2);
        w = [vy1*ux2, vy1*ux1, vy2*ux2, vy2*ux1];
        qx = [0, 0, 0, 0];
        qy = [0, 0, 0, 0];
        deltaZx = [0, 0, 0, 0];
        deltaZy = [0, 0, 0, 0];
        sQx = sQy = sW = 0;
        for (let i = 0; i < 4; i++) {
          sW += pow(w[i], 2);
          deltaZx[i] = adj_nodes[i].interp.x - smoothed_nodes[i].x;
          deltaZy[i] = adj_nodes[i].interp.y - smoothed_nodes[i].y;
          qx[i] = w[i] * deltaZx[i];
          qy[i] = w[i] * deltaZy[i];
          sQx += qx[i];
          sQy += qy[i];
        }

        hx1 = ux1 / resolution * (adj_nodes[1].interp.x-adj_nodes[0].interp.x) + adj_nodes[0].interp.x;
        hx2 = ux1 / resolution * (adj_nodes[3].interp.x-adj_nodes[2].interp.x) + adj_nodes[2].interp.x;
        HX = vy1 / resolution * (hx1 - hx2) + hx2;
        hy1 = ux1 / resolution * (adj_nodes[1].interp.y-adj_nodes[0].interp.y) + adj_nodes[0].interp.y;
        hy2 = ux1 / resolution * (adj_nodes[3].interp.y-adj_nodes[2].interp.y) + adj_nodes[2].interp.y;
        HY = vy1 / resolution * (hy1 - hy2) + hy2;

        deltaX = adj_pt.x - HX;
        deltaY = adj_pt.y - HY;
        dx = deltaX * resolution * resolution;
        dy = deltaY * resolution * resolution;

        for (let i = 0; i < 4; i++) {
          adjX = u * v * ((dx - qx[i] + sQx) * w[i] + deltaZx[i] * (w[i] * w[i] - sW)) / adj_nodes[i].weight;
          adj_nodes[i].interp.x += adjX;
          adjY = u * v * ((dy - qy[i] + sQy) * w[i] + deltaZy[i] * (w[i] * w[i] - sW)) / adj_nodes[i].weight;
          adj_nodes[i].interp.y += adjY;
        }
      }

      p_tmp = new Point(0, 0);
      for (let l = 0, wh = width * height; l < wh; l++){
        delta = 0;
        for (let i = 0; i < height; i++) {
          for (let j = 0; j < width; j++) {
            n = this.get_node(i, j);
            if (n.weight === 0) {
              p_tmp.x = n.interp.x;
              p_tmp.y = n.interp.y;
              _p = this.get_smoothed(i, j);
              n.interp.x = _p.x;
              n.interp.y = _p.y;
              delta = max(delta, p_tmp.distance(n.interp) / rect_dim);
            }
          }
        }
        if (l > 5 && sqrt(delta) < 0.0001) break;
      }

    }
    this.interp_points = [];
    for (let ix = 0; ix < nb_pts; ix++) {
      this.interp_points.push(this.get_interp_point(this.points[ix]));
    }
    return this.interp_points;
  }

  get_smoothed(i, j) {
    if (i > 1 && j > 1 && i < this.height - 2 && j < this.width - 2) {
      const a =  this.get_node(i-1, j).interp;
      const b =  this.get_node(i+1, j).interp;
      const c =  this.get_node(i, j-1).interp;
      const d =  this.get_node(i, j+1).interp;
      const e =  this.get_node(i-1, j-1).interp;
      const f =  this.get_node(i+1, j-1).interp;
      const g =  this.get_node(i+1, j+1).interp;
      const h =  this.get_node(i-1, j+1).interp;
      const _i =  this.get_node(i-2, j).interp;
      const _j =  this.get_node(i+2, j).interp;
      const k =  this.get_node(i, j-2).interp;
      const l =  this.get_node(i, j+2).interp;
      return new Point(
          (8 *
           (a.x + b.x + c.x + d.x)
           -2 * (e.x + f.x + g.x + h.x)
           - (_i.x + _j.x + k.x + l.x)) / 20,
          (8 *
           (a.y + b.y + c.y + d.y)
           -2 * (e.y + f.y + g.y + h.y)
           - (_i.y + _j.y + k.y + l.y)) / 20
              )
    }
    let n, nb = 0, sx = 0, sy = 0;
    if (i > 0) {
        n =  this.get_node(i - 1, j).interp;
        sx += n.x;
        sy += n.y;
        nb += 1;
    } else {
        sy += this.scaleY * this.resolution;
    }
    if (j > 0) {
        n =  this.get_node(i, j - 1).interp;
        sx += n.x;
        sy += n.y;
        nb += 1;
    } else {
        sx -= this.scaleX * this.resolution;
    }

    if (i < this.height - 1) {
        n =  this.get_node(i+1, j).interp;
        sx += n.x;
        sy += n.y;
        nb += 1;
    } else {
        sy -= this.scaleY * this.resolution;
    }

    if (j < this.width - 1) {
        n =  this.get_node(i, j + 1).interp;
        sx += n.x;
        sy += n.y;
        nb += 1;
    } else {
        sx += this.scaleX * this.resolution;
    }

    return new Point(sx / nb, sy / nb)
  }

  _interp_point(x, y) {
    const p = this.get_interp_point(new Point(x, y));
    return [p.x, p.y];
  }
}

const getBoundingRect = (points) => {
  minx = Infinity;
  miny = Infinity;
  maxx = -Infinity;
  maxy = -Infinity;
  for(let i = 0, len = points.length; i < len; i++) {
    const p = points[i];
    if (p.x > maxx) maxx = p.x;
    if (p.x < minx) minx = p.x;
    if (p.y > maxy) maxy = p.y;
    if (p.y < miny) miny = p.y;
  }
  return [minx, miny, maxx, maxy];
};

function getTotalBounds(geojson) {
  const _getBoundingRect = (points) => {
    for(let i = 0, len = points.length; i < len; i++) {
      const p = points[i];
      if (p[0] > maxx) maxx = p[0];
      if (p[0] < minx) minx = p[0];
      if (p[1] > maxy) maxy = p[1];
      if (p[1] < miny) miny = p[1];
    }
  };
  const features = geojson.features;
  const nb_ft = features.length;
  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  for (let i = 0; i < nb_ft; i++) {
    const geom = features[i].geometry;
    if (geom.type === 'Polygon') {
      geom.coordinates.forEach(ring => _getBoundingRect(ring));
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach(poly => poly.forEach(ring => _getBoundingRect(ring)));
    }
  }
  return [minx, miny, maxx, maxy];
}

class DistCarto {
  constructor(source_pts_coordinates, image_pts_coordinates, background, precision) {
    this.background = JSON.parse(JSON.stringify(background));
    const rect = getTotalBounds(background);
    this.source = [];
    this.image = [];
    for (let i = 0; i < source_pts_coordinates.length; i++) {
      this.source.push(new Point(source_pts_coordinates[i][0], source_pts_coordinates[i][1]));
      this.image.push(new Point(image_pts_coordinates[i][0], image_pts_coordinates[i][1]));
    }
    this.grid = new Grid(this.source, precision, rect);
    this.grid.interpolate(this.image, this._get_inter_nb_iter(4));
  }

  _get_inter_nb_iter(coef_iter) {
    return (coef_iter * sqrt(this.source.length)) | 0;
  }

  transform_background() {
    const grid = this.grid;
    const features = this.background.features;
    features.forEach((ft) => {
      const geom = ft.geometry;
      if (geom.type === 'Polygon') {
        geom.coordinates = geom.coordinates.map(
          ring => ring.map(pt => grid._interp_point(pt[0], pt[1])));
      } else if (geom.type === 'MultiPolygon') {
        geom.coordinates = geom.coordinates.map(
          polys => polys.map(ring => ring.map(pt => grid._interp_point(pt[0], pt[1]))));
      }
    });
    return this.background;
  }

  _get_grid(type='source') {
    const features = [];
    for (let i = 0; i < this.grid.height - 1; i++) {
      for (let j = 0; j < this.grid.width - 1; j++) {

        features.push({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'Polygon',
            coordinates: [[
              this.grid.get_node(i, j)[type].to_xy(),
              this.grid.get_node(i + 1, j)[type].to_xy(),
              this.grid.get_node(i + 1, j + 1)[type].to_xy(),
              this.grid.get_node(i, j + 1)[type].to_xy(),
              this.grid.get_node(i, j)[type].to_xy(),
            ]],
          },
        });
      }
    }
    return { type: 'FeatureCollection', features: features };
  }

  get_source_grid() {
    return this._get_grid('source');
  }

  get_interp_grid() {
    return this._get_grid('interp');
  }
}
