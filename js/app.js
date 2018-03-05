(function ($, L) {
  'use strict'

  // Mapbox token
  const ACCESSTOKEN = 'pk.eyJ1IjoiZ2lzdXgiLCJhIjoiY2l5NjVveDJ4MDA0bzMzcDJjdWlqaDg4MiJ9.K4sFHK_WWcOTQa_59YhPoA'

  const util = {
    formatNumCommas (x) {
      // Format number with commas
      return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    }
  }

  // Data layers used for map overlays
  let dataLayers = {
    evSales: {
      abbr: 'BEV',
      fillColor: '#2c7fb8',
      geojson: {},
      totalSales: 0
    },
    phevSales: {
      abbr: 'PHEV',
      fillColor: '#7fcdbb',
      geojson: {},
      totalSales: 0
    }
  }

  // Base layer options
  let baseLayerOpts = {
    attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> <strong><a href="https://www.mapbox.com/map-feedback/" target="_blank">Improve this map</a></strong>',
    maxZoom: 12,
    accessToken: ACCESSTOKEN
  }

  let Map = {
    init () {
      // Initialize map with zoom and center options
      const map = L.map('map-container').setView([37.8, -96], 4)

      // Add map lat, lon, zoom values to URL hash
      new L.Hash(map)

      // Set the Mapbox URL for retrieving base layers
      let mapURL = 'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=' + ACCESSTOKEN

      // Initialize map base layers with layer options
      let baseLayers = {
        'Light': L.tileLayer(mapURL, {
          ...baseLayerOpts,
          id: 'mapbox.light'
        }).addTo(map),

        'Dark': L.tileLayer(mapURL, {
          ...baseLayerOpts,
          id: 'mapbox.dark'
        })
      }

      // Set default year for map data
      this.dataYear = 2011

      // Initialize geoJSON layers
      this.evSales = new L.geoJson()
      this.phevSales = new L.geoJson()

      // Get geoJSON data
      this.getEVData(map)
      this.getPHEVData(map)

      // Initialize map overlay layers
      let overlays = {
        'EV Sales': this.evSales.addTo(map),
        'PHEV Sales': this.phevSales.addTo(map)
      }

      // Add base layer and over layer control to map
      L.control.layers(baseLayers, overlays, {collapsed: false, position: 'topleft'}).addTo(map)
    },
    initSlider (map) {
      // Set min, max, and default values for slider control plugin
      let curVal = 0
      let minVal = Math.min(...Map.dataAttributes)
      let maxVal = Math.max(...Map.dataAttributes)

      // Initialize slider
      let slider = $('.range-slider').slider({
        max: maxVal,
        min: minVal,
        formatter: function (value) {
          return 'Year: ' + value
        },
        value: minVal
      })

      // When slider value changes update map and legend
      slider.on('change', function (e) {
        // Close all popups
        map.closePopup()

        // Get selected year from slider control plugin
        Map.dataYear = parseInt(slider.data('slider').getValue())

        // Update map based on selected year
        Map.update(map, Map.dataYear)

        // Get total sales value for each EV type
        for (let key in dataLayers) {
          Map.getNWTotals(key)
        }

        // Display selected year in legend
        $('#temporalLegend').text(Map.dataYear)
      })

      $('.btn-next').on('click', function (e) {
        curVal = slider.data('slider').getValue()

        // If slider value is at max, set to min value so slider resets to start
        if (curVal === maxVal) {
          slider.data('slider').setValue(minVal)
        } else {
          slider.data('slider').setValue(curVal + 1)
        }

        slider.change()
      })

      $('.btn-prev').on('click', function (e) {
        // getSliderVals()

        curVal = slider.data('slider').getValue()

        // If slider value is at min, set to max value so slider loops around
        if (curVal === minVal) {
          slider.data('slider').setValue(maxVal)
        } else {
          slider.data('slider').setValue(curVal - 1)
        }

        slider.change()
      })
    },
    getEVData (map) {
      // Get the EV sales data (geoJSON)
      $.ajax('data/ev-registrations-by-state-year-geocoded.geojson', {
        dataType: 'json',
        success: function (response) {
          // Create proportional symbols for map data
          Map.createPropSymbols(response, map, Map.evSales, 'evSales')

          // Store response data for future use
          dataLayers['evSales'].features = response.features

          // Get total EV sales data
          Map.getNWTotals('evSales')

          Map.dataAttributes = Map.processData(response)

          // Initialize map slider
          Map.initSlider(map)

          // Create map legend
          Map.createLegend(map, 'evSales')
        }
      }).fail(function () {
        // Display alert if AJAX fails
        window.alert('Unable to load GEOJSON data.')
      })
    },
    getPHEVData (map) {
      // Get the PHEV sales data (geoJSON)
      $.ajax('data/phev-registrations-by-state-year-geocoded.geojson', {
        dataType: 'json',
        success: function (response) {
          // Create proportional symbols for map data
          Map.createPropSymbols(response, map, Map.phevSales, 'phevSales')

          // Store response data for future use
          dataLayers['phevSales'].features = response.features

          // Get total PHEV sales data
          Map.getNWTotals('phevSales')

          // Create map legend
          Map.createLegend(map, 'phevSales')
        }
      }).fail(function () {
        // Display alert if AJAX fails
        window.alert('Unable to load GEOJSON data.')
      })
    },
    getNWTotals (layerID) { // Get total sales for each EV type
      let features = dataLayers[layerID].features
      let featuresLen = features.length
      let totalYear = 0

      // Loop through the geoJSON data for each EV type and sum the values for each year
      for (let i = 0; i < featuresLen; i++) {
        if (features[i].properties[Map.dataYear]) {
          totalYear += parseInt(features[i].properties[Map.dataYear])
        }
      }

      // Format the total value with comma
      dataLayers[layerID].totalSales = util.formatNumCommas(totalYear)

      // Display the total in the map sidebar
      $('#total-' + layerID).empty().text(dataLayers[layerID].totalSales)
    },
    createPropSymbols (data, map, dataLayer, layerName) {
      // Create proportional circle markers based on data layer
      dataLayers[layerName].geoJSON = L.geoJson(data, {
        pointToLayer: function (feature, latlng) {
          // Set marker options
          let options = {
            radius: 8,
            fillColor: dataLayers[layerName].fillColor,
            color: '#333',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
          }

          // create circle marker layer
          let layer = L.circleMarker(latlng, options)

          // bind the popup to the circle marker
          let popup = Map.createPopup(feature.properties, layerName)
          layer.bindPopup(popup)

          // Display popup when user hovers over marker
          layer.on({
            mouseover: function () {
              this.openPopup()
            },
            mouseout: function () {
              this.closePopup()
            }
          })

          // For each feature, determine its value for the selected year
          let attValue = Number(feature.properties[Map.dataYear])

          // Get calculated circle marker radius
          let radius = Map.calcPropRadius(attValue)
          layer.setRadius(radius)

          return layer
        }
      }).addTo(dataLayer)
    },
    calcPropRadius (attValue) {
      // Scale factor to adjust circle size evenly
      let scaleFactor = 0.0625
      // Area based on attribute value and scale factor
      let area = attValue * scaleFactor
      // Radius calculated based on area
      let radius = Math.sqrt(area / Math.PI)

      return radius
    },
    update (map) {
      // Update map layer markers and data when slider value changes
      for (let key in dataLayers) {
        dataLayers[key].geoJSON.eachLayer(function (layer) {
          if (layer.feature && layer.feature.properties[Map.dataYear]) {
            // Access feature properties
            let props = layer.feature.properties

            // Update each feature's radius based on new attribute values
            let radius = Map.calcPropRadius(props[Map.dataYear])
            layer.setRadius(radius)

            // Refresh popup content
            let popup = Map.createPopup(props, key)

            // Replace the layer popup
            layer.bindPopup(popup, {
              offset: new L.Point(0, -radius)
            })
          };
        })

        // Update map legend
        Map.updateLegend(map, key)
      }
    },
    createPopup (props, layerName) { // Create content for the popups
      let popupContent = ''

      popupContent += '<p class="title">' + props.state + '</p>'
      popupContent += '<p class="desc">' + Map.dataYear + ' ' + dataLayers[layerName].abbr + ' Sales' + '</p>'
      popupContent += '<p class="value">' + util.formatNumCommas(props[Map.dataYear]) + '</p>'

      return popupContent
    },
    processData (data) { // Get the list of years from the geoJSON data
      var attributes = []

      // Properties of the first feature in the dataset
      var properties = data.features[0].properties

      // Push each attribute name into attributes array
      for (var attribute in properties) {
        // Only take attributes that start with '20'
        if (attribute.indexOf('20') > -1) {
          attributes.push(attribute)
        };
      };

      return attributes
    },
    createLegend (map, layerID) { // Create map legend for each EV type
      let svg = '<svg id="attribute-legend" width="160px" height="70px">'

      // Array of circle names to base loop on
      let circles = {
        max: 20,
        mean: 40,
        min: 60
      }

      // Loop to add each circle and text to svg string
      for (let key in circles) {
        // Circle string
        svg += '<circle class="legend-circle" id="' + key + '-' + layerID + '" fill="' + dataLayers[layerID].fillColor + '" fill-opacity="0.8" stroke="#000000" cx="40"/>'

        // Text string
        svg += '<text id="' + key + '-text-' + layerID + '" x="75" y="' + circles[key] + '"></text>'
      };

      // Close svg string
      svg += '</svg>'

      // Add svg to each map legend
      $('#legend-' + layerID).append(svg)

      // Update the map legend
      Map.updateLegend(map, layerID)
    },
    getCircleValues (map, attribute, layerID) {
      // Start with min at highest possible and max at lowest possible number
      let min = Infinity
      let max = -Infinity

      dataLayers[layerID].geoJSON.eachLayer(function (layer) {
        // Get the attribute value
        if (layer.feature) {
          var attributeValue = Number(layer.feature.properties[attribute])

          // Test for min
          if (attributeValue < min) {
            min = attributeValue
          };

          // Test for max
          if (attributeValue > max) {
            max = attributeValue
          };
        };
      })

      // Set mean
      var mean = (max + min) / 2

      // Return values as an object
      return {
        max: max,
        mean: mean,
        min: min
      }
    },
    updateLegend (map, layerID) { // Update map legend when slider change
      // Get the max, mean, and min values as an object
      let circleValues = Map.getCircleValues(map, Map.dataYear, layerID)

      for (let key in circleValues) {
        // Get the radius
        let radius = Map.calcPropRadius(circleValues[key])

        // Assign the cy and r attributes
        $('#' + key + '-' + layerID).attr({
          cy: 64 - radius,
          r: radius
        })

        // Sdd legend text
        let legendText = util.formatNumCommas(Math.round(circleValues[key] * 100) / 100)
        $('#' + key + '-text-' + layerID).text(legendText)
      };
    }
  }

  Map.init()
})(jQuery, L)
