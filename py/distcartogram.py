#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from math import sqrt, radians, cos, sin, asin, ceil, pow as m_pow
from shapely.ops import transform
from shapely.geometry import Polygon, LineString
from geopandas import GeoDataFrame
import numpy as np


class Node:
    __slots__ = ['weight', 'i', 'j', 'source', 'interp']

    def __init__(self, i, j, src=None):
        self.weight = 0
        self.i = i
        self.j = j
        self.source = src
        self.interp = None


class Point:
    __slots__ = ['x', 'y']

    def __init__(self, x, y):
        self.x = x
        self.y = y

    def to_xy(self):
        return (self.x, self.y)

    def geo_distance(self, other):
        return haversine(self.x, self.y, other.x, other.y)

    def distance(self, other):
        a = self.x - other.x
        b = self.y - other.y
        return sqrt(a * a + b * b)


def haversine(lon1, lat1, lon2, lat2):
    lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
    c = 2 * asin(sqrt(a))
    r = 6371
    return c * r


class Rectangle2D:
    __slots__ = ['height', 'width', 'x', 'y']

    def __init__(self, height, width, x, y):
        self.height = height
        self.width = width
        self.x = x
        self.y = y

    def add(self, pt):
        if pt.x < self.x:
            self.x = pt.x
        if pt.y < self.y:
            self.y = pt.y
        tx = pt.x - self.x
        ty = pt.y - self.y
        if tx > self.width:
            self.width = tx
        if ty > self.height:
            self.height = ty


def getBoundingRect(points):
    minx = float('inf')
    miny = float('inf')
    maxx = -float('inf')
    maxy = -float('inf')
    for p in points:
        if p.x > maxx:
            maxx = p.x
        if p.x < minx:
            minx = p.x
        if p.y > maxy:
            maxy = p.y
        if p.y < miny:
            miny = p.y
    return (minx, miny, maxx, maxy)


class Grid:
    def __init__(self, points, precision, rect=None):
        self.points = points
        if not rect:
            rect = getBoundingRect(points)
        rect = list(rect)
        self.rect_width = rect[2] - rect[0]
        self.rect_height = rect[3] - rect[1]
        self.resolution = 1 / precision * sqrt(
                self.rect_width * self.rect_height / len(points))
        self.width = ceil(self.rect_width / self.resolution) + 1
        self.height = ceil(self.rect_height / self.resolution) + 1
        self.dx = self.width * self.resolution - self.rect_width
        self.dy = self.height * self.resolution - self.rect_height
        rect[0] = rect[0] - self.dx / 2
        rect[1] = rect[1] - self.dy / 2
        rect[2] = rect[2] + self.dx / 2
        rect[3] = rect[3] + self.dy / 2
        self.rect_width = rect[2] - rect[0]
        self.rect_height = rect[3] - rect[1]

        self.width += 1
        self.height += 1
        self.min_x = rect[0]
        self.max_y = rect[3]
        self.nodes = []
        resolution = self.resolution
        for i in range(self.height):
            for j in range(self.width):
                self.nodes.append(Node(i, j, Point(
                        self.min_x + j * resolution,
                        self.max_y - i * resolution
                        )))

        for p in points:
            adj_nodes = self.get_adj_nodes(p)
            for n in adj_nodes:
                n.weight += 1

    def get_node(self, i, j):
        if i < 0 or j < 0 or i >= self.height or j >= self.width:
            return None
        return self.nodes[i * self.width + j]

    def get_i(self, p):
        return int((self.max_y - p.y) / self.resolution)

    def get_j(self, p):
        return int((p.x - self.min_x) / self.resolution)

    def get_adj_nodes(self, point):
        i = self.get_i(point)
        j = self.get_j(point)
        adj_nodes = [
                self.get_node(i, j),
                self.get_node(i, j + 1),
                self.get_node(i + 1, j),
                self.get_node(i + 1, j + 1)
                ]
        return adj_nodes

    def get_interp_point(self, src_point):
        adj_nodes = self.get_adj_nodes(src_point)
        resolution = self.resolution
        ux1 = src_point.x - adj_nodes[0].source.x
        vy1 = src_point.y - adj_nodes[2].source.y
        hx1 = ux1/resolution * (
                adj_nodes[1].interp.x-adj_nodes[0].interp.x
                ) + adj_nodes[0].interp.x
        hx2 = ux1/resolution * (
                adj_nodes[3].interp.x-adj_nodes[2].interp.x
                ) + adj_nodes[2].interp.x
        HX = vy1/resolution * (hx1 - hx2) + hx2
        hy1 = ux1/resolution * (
                adj_nodes[1].interp.y-adj_nodes[0].interp.y
                ) + adj_nodes[0].interp.y
        hy2 = ux1/resolution * (
                adj_nodes[3].interp.y-adj_nodes[2].interp.y
                ) + adj_nodes[2].interp.y
        HY = vy1/resolution * (hy1 - hy2) + hy2

        return Point(HX, HY)

    def _interp_point(self, x, y):
        p = self.get_interp_point(Point(x, y))
        return (p.x, p.y)

    def get_diff(self, i, j, diff):
        if not diff:
            diff = [0] * 4
        n = self.get_node(i, j)
        ny1 = self.get_node(i - 1, j)
        ny2 = self.get_node(i + 1, j)
        nx1 = self.get_node(i, j - 1)
        nx2 = self.get_node(i, j + 1)
        resolution = self.resolution
        if not nx1:
            diff[0] = (nx2.interp.x - n.interp.x) / resolution
            diff[1] = (nx2.interp.y - n.interp.y) / resolution
        elif not nx2:
            diff[0] = (n.interp.x - nx1.interp.x) / resolution
            diff[1] = (n.interp.y - nx1.interp.y) / resolution
        else:
            diff[0] = (nx2.interp.x - nx1.interp.x) / (2 * resolution)
            diff[1] = (nx2.interp.y - nx1.interp.y) / (2 * resolution)

        if not ny1:
            diff[2] = (n.interp.x - ny2.interp.x) / resolution
            diff[3] = (n.interp.y - ny2.interp.y) / resolution
        elif not ny2:
            diff[2] = (ny1.interp.x - n.interp.x) / resolution
            diff[3] = (ny1.interp.y - n.interp.y) / resolution
        else:
            diff[2] = (ny1.interp.x - ny2.interp.x) / (2 * resolution)
            diff[3] = (ny1.interp.y - ny2.interp.y) / (2 * resolution)

        return diff

    def interpolate(self, img_points, nb_iter):
        for n in self.nodes:
            n.interp = Point(n.source.x, n.source.y)

        rect = Rectangle2D(0, 0, float('inf'), float('inf'))
        for p in self.points:
            rect.add(p)
        rect_adj = Rectangle2D(0, 0, float('inf'), float('inf'))
        for p in img_points:
            rect_adj.add(p)

        self.scaleX = rect_adj.width / rect.width
        self.scaleY = rect_adj.height / rect.height

        resolution = self.resolution
        width, height = self.width, self.weight
        rect_dim = self.rect_width * self.rect_height
        get_node = self.get_node
        get_smoothed, get_adj_nodes = self.get_smoothed, self.get_adj_nodes

        for k in range(nb_iter):
            for (src_pt, adj_pt) in zip(self.points, img_points):
                adj_nodes = get_adj_nodes(src_pt)
                smoothed_nodes = [get_smoothed(a.i, a.j) for a in adj_nodes]

                ux1 = src_pt.x - adj_nodes[0].source.x
                ux2 = resolution - ux1
                vy1 = src_pt.y - adj_nodes[2].source.y
                vy2 = resolution - vy1
                u = 1 / (ux1*ux1 + ux2*ux2)
                v = 1 / (vy1*vy1 + vy2*vy2)
                w = [vy1*ux2, vy1*ux1, vy2*ux2, vy2*ux1]
                qx = [0] * 4
                qy = [0] * 4
                deltaZx = [0] * 4
                deltaZy = [0] * 4
                sQx = sQy = sW = 0
                for i in range(4):
                    sW += m_pow(w[i], 2)
                    deltaZx[i] = adj_nodes[i].interp.x - smoothed_nodes[i].x
                    deltaZy[i] = adj_nodes[i].interp.y - smoothed_nodes[i].y
                    qx[i] = w[i] * deltaZx[i]
                    qy[i] = w[i] * deltaZy[i]
                    sQx += qx[i]
                    sQy += qy[i]

                hx1 = ux1/resolution * (
                    adj_nodes[1].interp.x-adj_nodes[0].interp.x
                    ) + adj_nodes[0].interp.x
                hx2 = ux1/resolution * (
                    adj_nodes[3].interp.x-adj_nodes[2].interp.x
                    ) + adj_nodes[2].interp.x
                HX = vy1/resolution * (hx1 - hx2) + hx2
                hy1 = ux1/resolution * (
                    adj_nodes[1].interp.y-adj_nodes[0].interp.y
                    ) + adj_nodes[0].interp.y
                hy2 = ux1/resolution * (
                    adj_nodes[3].interp.y-adj_nodes[2].interp.y
                    ) + adj_nodes[2].interp.y
                HY = vy1/resolution * (hy1 - hy2) + hy2

                deltaX = adj_pt.x - HX
                deltaY = adj_pt.y - HY
                dx = deltaX * resolution * resolution
                dy = deltaY * resolution * resolution

                for i in range(4):
                    adjX = u * v * (
                        (dx-qx[i]+sQx)*w[i] + deltaZx[i]*(w[i]*w[i] - sW)
                        ) / adj_nodes[i].weight
                    adj_nodes[i].interp.x += adjX
                    adjY = u * v * (
                        (dy-qy[i]+sQy)*w[i] + deltaZy[i]*(w[i]*w[i] - sW)
                        ) / adj_nodes[i].weight
                    adj_nodes[i].interp.y += adjY

            p_tmp = Point(0, 0)
            for l in range(width * height):
                delta = 0
                for i in range(height):
                    for j in range(width):
                        n = get_node(i, j)
                        if n.weight == 0:
                            p_tmp.x = n.interp.x
                            p_tmp.y = n.interp.y
                            _p = get_smoothed(i, j)
                            n.interp.x = _p.x
                            n.interp.y = _p.y
                            delta = max(
                                [delta, p_tmp.distance(n.interp) / rect_dim])
                if l > 5 and sqrt(delta) < 0.0001:
                    break

        self.interp_points = [
            self.get_interp_point(self.points[i])
            for i in range(len(img_points))
            ]

        return self.interp_points

    def get_smoothed(self, i, j):
        get_node = self.get_node
        if i > 1 and j > 1 and i < self.height - 2 and j < self.width - 2:
            a = get_node(i-1, j).interp
            b = get_node(i+1, j).interp
            c = get_node(i, j-1).interp
            d = get_node(i, j+1).interp
            e = get_node(i-1, j-1).interp
            f = get_node(i+1, j-1).interp
            g = get_node(i+1, j+1).interp
            h = get_node(i-1, j+1).interp
            _i = get_node(i-2, j).interp
            _j = get_node(i+2, j).interp
            k = get_node(i, j-2).interp
            _l = get_node(i, j+2).interp
            return Point(
                (8 *
                 (a.x + b.x + c.x + d.x)
                 - 2 * (e.x + f.x + g.x + h.x)
                 - (_i.x + _j.x + k.x + _l.x)) / 20,
                (8 *
                 (a.y + b.y + c.y + d.y)
                 - 2 * (e.y + f.y + g.y + h.y)
                 - (_i.y + _j.y + k.y + _l.y)) / 20
                    )

        nb = sx = sy = 0
        if i > 0:
            n = get_node(i - 1, j).interp
            sx += n.x
            sy += n.y
            nb += 1
        else:
            sy += self.scaleY * self.resolution
        if j > 0:
            n = get_node(i, j - 1).interp
            sx += n.x
            sy += n.y
            nb += 1
        else:
            sx -= self.scaleX * self.resolution

        if i < self.height - 1:
            n = get_node(i + 1, j).interp
            sx += n.x
            sy += n.y
            nb += 1
        else:
            sy -= self.scaleY * self.resolution

        if j < self.width - 1:
            n = get_node(i, j + 1).interp
            sx += n.x
            sy += n.y
            nb += 1
        else:
            sx += self.scaleX * self.resolution

        return Point(sx/nb, sy/nb)


class DistCarto:
    def __init__(
            self, source, source_id, image, image_id, background, precision):
        ids = source[source_id].values
        self.source = []
        self.image = []
        for ix in ids:
            self.source.append(
                source[source[source_id] == ix].geometry.values[0])
            self.image.append(
                image[image[image_id] == ix].geometry.values[0])

        self.background = background
        rect = background.total_bounds
        if rect.tolist:
            rect = rect.tolist()
        self.g = Grid(self.source, precision, rect)
        self.g.interpolate(self.image, self._get_inter_nb_iter(4))

    def _get_inter_nb_iter(self, coef_iter):
        return int(coef_iter * sqrt(len(self.source)))

    def _get_grid(self, _type='source'):
        if _type not in ('source', 'interp'):
            raise ValueError('Invalid grid type requested')
        grid = self.g
        polys = []
        for i in range(grid.height - 1):
            for j in range(grid.width - 1):
                polys.append(Polygon([
                        getattr(grid.get_node(i, j), _type).to_xy(),
                        getattr(grid.get_node(i + 1, j), _type).to_xy(),
                        getattr(grid.get_node(i + 1, j + 1), _type).to_xy(),
                        getattr(grid.get_node(i, j + 1), _type).to_xy(),
                        getattr(grid.get_node(i, j), _type).to_xy()
                        ]))
        return GeoDataFrame(geometry=polys, index=range(len(polys)))

    def get_source_grid(self):
        return self._get_grid('source')

    def get_interp_grid(self):
        return self._get_grid('interp')

    def transform_background(self):
        b = self.background.copy()
        b.geometry = [
            transform(self.g._interp_point, geom) for geom in b.geometry]
        return b


def extrapole_line(p1, p2, ratio):
    return LineString([
        p1,
        (p1[0] + ratio * (p2[0] - p1[0]), p1[1] + ratio * (p2[1] - p1[1]))
    ])


def getImageLayer(source, id_my_feature, mat, col_idx=None):
    reset_index = False
    if col_idx and (not source.index.name or col_idx not in source.index.name):
        if source.index.name:
            reset_index = source.index.name
        else:
            reset_index = True
        source.set_index(col_idx, inplace=True)
    first_col = mat.columns[0]
    extract = mat[[first_col, id_my_feature]][:]
    extract.columns = ['id', 'time']
    extract.loc[:, 'id'] = extract['id'].apply(lambda x: str(x))
    extract.set_index('id', inplace=True)
    layer = source.join(extract)
    origin_feature = layer.loc[id_my_feature]
    origin_geom = origin_feature.geometry
    layer.loc[:, 'dist_euclidienne'] = layer.geometry.apply(
        lambda x: x.distance(origin_geom))
    layer.loc[:, 'vitesse'] = layer.dist_euclidienne / layer.time
    ref_vitesse = np.nanmedian(layer['vitesse'])
    layer.loc[:, 'deplacement'] = layer['vitesse'].apply(
        lambda x: ref_vitesse / x)
    layer.loc[:, 'deplacement'].replace(np.nan, 1, inplace=True)
    x1 = origin_geom.coords.xy[0][0]
    y1 = origin_geom.coords.xy[1][0]
    p1 = (x1, y1)
    ids, geoms = [], []
    for d in layer[
            ['geometry', 'deplacement', 'dist_euclidienne']].itertuples():
        deplacement = d.deplacement
        if deplacement <= 1:
            li = LineString([p1, d.geometry])
            p = li.interpolate(deplacement, normalized=True)
        else:
            p2 = (d.geometry.coords.xy[0][0], d.geometry.coords.xy[1][0])
            li = extrapole_line(p1, p2, 10)
            p = li.interpolate(deplacement * d.dist_euclidienne)
        ids.append(d.Index)
        geoms.append(p)

    if reset_index and not isinstance(reset_index, str):
        source.reset_index(inplace=True)
    elif isinstance(reset_index, str):
        source.set_index(reset_index, drop=False, inplace=True)

    image = GeoDataFrame(ids, geometry=geoms)
    image.crs = layer.crs
    image.columns = ['id', 'geometry']
    return image
