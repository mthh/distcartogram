## DistCartogram

*Distance cartogram* from 2 sets of related points: source points and image points.
Deformations to fit image points and source points are calculated using Waldo Tobler's bidimensional regression.

#### Usage / example:
Load the background shape to be deformed:
```
import geopandas as gpd
background = gpd.read_file('background.shp')
background.plot()
```
![background_plot](https://raw.githubusercontent.com/mthh/distcartogram/master/misc/background.png)

Load the source and image points layers:
```
source = gpd.read_file('source.shp')
image = gpd.read_file('image.shp')
```

Calculate the cartogram:
```
from distcartogram import DistCarto
c = DistCarto(source, 'id', image, 'FID', background, 2)
result = c.transform_background()
result.plot()
```
![result_plot](https://raw.githubusercontent.com/mthh/distcartogram/master/misc/result.png)


#### Credits - License:

Code is a direct adaptation of [Darcy](http://thema.univ-fcomte.fr/production/logiciels/16-categories-en-francais/cat-productions-fr/cat-logiciels-fr/294-art-darcy)([Sourceforge](https://sourceforge.net/p/jdarcy/wiki/Home/)) software (G. Vuidel and C. Cauvin - released under GPLv3).  
    
Motivated by the wish to see if there is a possible interest or difficulty to integrate this method in another environment than Darcy, such as [Magrit](https://github.com/riatelab/magrit) or a qgis plugin.