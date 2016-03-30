function ShapeEngine() {

  var $canvas,
      $body,
      _originalCanvasDimensions,
      _canvasDimensions,
      _maintainCanvasToShapeRatio,
      _enforceBounds,
      _boundsBuffer,
      _shapes,
      _stage,
      _update,
      _resizeOffset,
      _adjustmentOffset,
      _mirrorOffset,
      _dragOffset,
      _adjusting,
      _doDrawMarquee,
      _marqueeDragOffset,
      _marquee,
      _marqueeOptions,
      _drawMode,
      _doDrawLine,
      _lineDragOffset,
      _attachmentDragOffsets,
      _attachmentImages,
      _clickLocationOffset,
      _currentlyHoveringOver,
      _currentlySelected,
      _doDeselectAll,
      _currentWidth,
      _currentHeight,
      _currentAspectRatio,
      _currentWidthScale,
      _currentHeightScale,
      _currentLocationX,
      _currentLocationY,
      _currentlyResizingLayerIndex,
      _currentlyAdjustingLayerIndex,
      _currentKeysPressed,
      _keyMap;

  function _init(stageOptions, shapeOptions) {

    _shapes = [];
    _currentlySelected = [];
    _currentKeysPressed = [];

    _keyMap = {
      MODIFIER_1: navigator.userAgent.indexOf("Macintosh") > -1 ? 91 : 17,
      MODIFIER_2: 16,
      LEFT: 37,
      UP: 38,
      RIGHT: 39,
      DOWN: 40,
      SELECT_NEXT: 9,
      GROUP: 71,
      LOCK: 76,
      FLIP_HORIZONTAL: 72,
      FLIP_VERTICAL: 86,
      DELETE: 12345
    };

    // init attachmentDragOffsets with empty object
    _attachmentDragOffsets = {};
    _attachmentImages = {};

    // create canvas and stage
    $canvas = $('<canvas height="' + stageOptions.canvasHeight + '" width="' + stageOptions.canvasWidth + '"></canvas>');
    _stage = new createjs.Stage($canvas.get(0));

    // store other jquery elements for later use
    $body = $("body");

    //store original canvas dimensions
    _originalCanvasDimensions = {
      height: stageOptions.canvasHeight,
      width: stageOptions.canvasWidth
    };
    _canvasDimensions = _originalCanvasDimensions;

    //check for enforceBounds and boundsBuffer options
    _enforceBounds = stageOptions.enforceBounds ? stageOptions.enforceBounds : true;
    _boundsBuffer = stageOptions.boundsBuffer ? stageOptions.boundsBuffer : 5;

    //check for maintainCanvasToShapeRatio option
    _maintainCanvasToShapeRatio = stageOptions.maintainCanvasToShapeRatio ? stageOptions.maintainCanvasToShapeRatio : true;

    // enable touch interactions if supported on the current device:
    createjs.Touch.enable(_stage);

    // enabled mouse over/out events
    _stage.enableMouseOver(10);
    _stage.mouseMoveOutside = true; // keep tracking the mouse even when it leaves the canvas

    //update on next frame draw
    _doUpdate();

    //bind all our default ui actions
    _bindUIActions();

    //init tick function
    createjs.Ticker.addEventListener("tick", _tick);

    //add the first shape to the stage
    if (shapeOptions) _addShape(shapeOptions);

    //inject our canvas into the specified container
    stageOptions.target.append($canvas);

    //deselect all shapes any time a form is given focus, so that it doesn't interrupt tabbing, etc.
    $body.find("input").on("focus", function() {
      _deselectAllShapes();
    });

    if (_maintainCanvasToShapeRatio) {

      $(window).on("resize", function() {

        // compare widths and resize our shapes as needed to maintain the ratio between canvas size and shape size
        // (currently we don't compare heights because width/height ratio is being maintained, so we can assume that if the width has not changed, neither has the height)
        if ($canvas.width() !== _canvasDimensions.width) {

          var widthAspectRatio = $canvas.width() / _canvasDimensions.width;
          var heightAspectRatio = $canvas.height() / _canvasDimensions.height;
          _canvasDimensions = {
            height: $canvas.height(),
            width: $canvas.width()
          };

          $.each(_shapes, function(i, shape) {

            shape.shapeOptions.x *= widthAspectRatio;
            shape.shapeOptions.y *= heightAspectRatio;

            $.each(shape.shapeOptions.typeSettings.vertices, function(j, vertex) {

              vertex.x *= widthAspectRatio;
              vertex.y *= heightAspectRatio;
            });
          });
        }

        _removeAndRedrawAll();
      });
    }

    return $canvas;
  }

  function _bindUIActions() {
    $body.on("keydown", __bodyKeyDownHandler);
    $body.on("keyup", __bodyKeyUpHandler);
    _stage.on("stagemousedown", __stageMouseDownHandler);
    _stage.on("stagemouseup", __stageMouseUpHandler);
    _stage.on("stagemousemove", __stageMouseMoveHandler);
    $canvas.on("touchend click", __canvasClickHandler);

    function __bodyKeyDownHandler(e) {
      //loop through all the currently pressed keys and see if this one is already in there
      //if we don't do this, holding down a key will add duplicates to this array
      var keyIndex = null;
      $.each(_currentKeysPressed, function(i, key) {
        if (e.which == key) {
          keyIndex = i;
          return false;
        }
      });

      //if it doesn't already exist in the array, add it
      if (keyIndex === null) {
        _currentKeysPressed.push(e.which);
      }

      //change the cursor to "copy" if we are holding ctrl over a shape
      if (e.which == _keyMap.MODIFIER_1) {

        if (_currentlySelected.length > 0 && _currentlyHoveringOver) {

          e.preventDefault();

          $.each(_shapes, function(i, currentShape) {
            if (currentShape.name == _currentlyHoveringOver) {
              if (!_shapeIsSelected(currentShape)) currentShape.cursor = "copy";

              return false;
            }
          });
        }
      }

      //handle nudge up hot key
      if (e.which == _keyMap.UP) {

        if (_currentlySelected.length > 0) {

          e.preventDefault();

          $.each(_shapes, function(i, currentShape) {
            if (_shapeIsSelected(currentShape)) {

              //if modifier 1 is already pressed, change layers
              if (_keyIsPressed(_keyMap.MODIFIER_1)) {

                //go up a layer
                _moveUp();
              } else {

                //nudge the selected shape up 1 or 10 depending on if shift is being pressed
                _nudge(currentShape, "up", _keyIsPressed(_keyMap.MODIFIER_2) ? 10 : 1, false);
              }
            }
          });

          //redraw all shapes to maintain layers
          //then deselect and reselect all currently selected shape to maintain visible bounding box
          _redrawAllAndReSelectCurrentlySelected();
        }
      }

      //handle nudge up hot key
      if (e.which == _keyMap.RIGHT) {

        if (_currentlySelected.length > 0) {

          e.preventDefault();

          $.each(_shapes, function(i, currentShape) {
            if (_shapeIsSelected(currentShape)) {

              //nudge the selected shape up 1 or 10 depending on if shift is being pressed
              _nudge(currentShape, "right", _keyIsPressed(_keyMap.MODIFIER_2) ? 10 : 1, false);
            }
          });

          //redraw all shapes to maintain layers
          //then deselect and reselect all currently selected shape to maintain visible bounding box
          _redrawAllAndReSelectCurrentlySelected();
        }
      }

      //handle nudge up hot key
      if (e.which == _keyMap.DOWN) {

        if (_currentlySelected.length > 0) {

          e.preventDefault();

          $.each(_shapes, function(i, currentShape) {
            if (_shapeIsSelected(currentShape)) {

              //if modifier 1 is already pressed, change layers
              if (_keyIsPressed(_keyMap.MODIFIER_1)) {

                //go down a layer
                _moveDown();
              } else {
                //nudge the selected shape up 1 or 10 depending on if shift is being pressed
                _nudge(currentShape, "down", _keyIsPressed(_keyMap.MODIFIER_2) ? 10 : 1, false);
              }
            }
          });

          //redraw all shapes to maintain layers
          //then deselect and reselect all currently selected shape to maintain visible bounding box
          _redrawAllAndReSelectCurrentlySelected();
        }
      }

      //handle nudge up hot key
      if (e.which == _keyMap.LEFT) {

        if (_currentlySelected.length > 0) {

          e.preventDefault();

          $.each(_shapes, function(i, currentShape) {
            if (_shapeIsSelected(currentShape)) {

              //nudge the selected shape up 1 or 10 depending on if shift is being pressed
              _nudge(currentShape, "left", _keyIsPressed(_keyMap.MODIFIER_2) ? 10 : 1, false);
            }
          });

          //redraw all shapes to maintain layers
          //then deselect and reselect all currently selected shape to maintain visible bounding box
          _redrawAllAndReSelectCurrentlySelected();
        }
      }

      //handle select next hot key
      if (e.which == _keyMap.SELECT_NEXT) {

        if (_currentlySelected.length > 0) {

          e.preventDefault();

          $.each(_shapes, function(i, currentShape) {
            if (_shapeIsSelected(currentShape)) {

              //deselect currently selected shape
              _deselectShape(currentShape);

              //select next shape
              var newIndex;
              if (_keyIsPressed(_keyMap.MODIFIER_2)) newIndex = (i == _shapes.length - 1 ? 0 : i + 1);
              else newIndex = (i === 0 ? _shapes.length - 1 : i - 1);

              _makeCurrentlySelected(_shapes[newIndex], null, true);

              return false;
            }
          });
        }
      }

      //handle group hot key
      if (e.which == _keyMap.GROUP && _keyIsPressed(_keyMap.MODIFIER_1)) {

        if (_currentlySelected.length > 0) {

          e.preventDefault();

          _groupSelected();
        }
      }

      //handle lock hot key
      if (e.which == _keyMap.LOCK && _keyIsPressed(_keyMap.MODIFIER_1)) {

        if (_currentlySelected.length > 0) {

          e.preventDefault();

          _lockSelected();
        }
      }

      //handle flip horizontal hot key
      if (e.which == _keyMap.FLIP_HORIZONTAL && _keyIsPressed(_keyMap.MODIFIER_1)) {

        if (_currentlySelected.length > 0) {

          e.preventDefault();

          _flipHorizontal();
        }
      }

      //handle flip vertical hot key
      if (e.which == _keyMap.FLIP_VERTICAL && _keyIsPressed(_keyMap.MODIFIER_1)) {

        if (_currentlySelected.length > 0) {

          e.preventDefault();

          _flipVertical();
        }
      }
    }

    function __bodyKeyUpHandler(e) {
      //remove from _currentKeysPressed array
      $.each(_currentKeysPressed, function(i, key) {
        if (key == e.which) _currentKeysPressed.splice(i, 1);
      });

      //change the cursor back to "default" for all shapes
      $.each(_shapes, function(i, currentShape) {
        currentShape.cursor = "default";
      });
    }

    function __stageMouseDownHandler(e) {
      if (_drawMode) {
        _doDrawLine = true;

        _lineDragOffset = {
          x: e.stageX,
          y: e.stageY
        };
      } else {
        _doDrawMarquee = true;

        _marqueeDragOffset = {
          x: e.stageX,
          y: e.stageY
        };
      }

      //turn off html element highlighting while drawing marquee
      _toggleElementHighlighting("off");
    }

    function __stageMouseUpHandler(e) {
      //I had trouble stopping event propagation when clicking a shape
      //So to handle a stage click that isn't also a shape click,
      //we are utilizing both stagemouseup and canvas.click to determine
      //whether or not to deselect all shapes.
      if (_currentlySelected.length > 0) _doDeselectAll = true;

      //a marquee square was drawn
      if (_marquee !== null && _marquee !== undefined) {

        _deselectAllShapes();
        _doDeselectAll = false;

        _stage.removeChild(_marquee);

        var originX, originY;

        if (_marqueeDragOffset.x > e.stageX) originX = e.stageX;
        else originX = _marqueeDragOffset.x;

        if (_marqueeDragOffset.y > e.stageY) originY = e.stageY;
        else originY = _marqueeDragOffset.y;

        $.each(_shapes, function(i, currentShape) {

          if (currentShape.shapeOptions.selectable) {

            //calculate bounds for the current shape
            _calculateBounds(currentShape.shapeOptions.typeSettings.vertices, currentShape);

            //if the drawn marquee top left is above and to the left of the current shape
            if (currentShape.getBounds().x > originX && currentShape.getBounds().y > originY) {

              //calculate bottom right location for marquee and shape so we can see if the marquee encloses the shape
              var shapeBottomRight = {
                x: currentShape.getBounds().x + currentShape.getBounds().width,
                y: currentShape.getBounds().y + currentShape.getBounds().height
              };

              var marqueeBottomRight = {
                x: Math.abs(_marqueeOptions.typeSettings.sideWidth) + originX,
                y: Math.abs(_marqueeOptions.typeSettings.sideLength) + originY
              };

              if (shapeBottomRight.x < marqueeBottomRight.x && shapeBottomRight.y < marqueeBottomRight.y) {

                //the marquee encloses the current shape, so select it
                _makeCurrentlySelected(currentShape, null, true);
              }
            }
          }
        });

        _marquee = null;
        _doDrawMarquee = null;
        _marqueeOptions = null;
        _marqueeDragOffset = null;

        _doUpdate();
      } else {
        _doDrawMarquee = null;
        _marqueeDragOffset = null;
      }

      //turn html element highlighting back on
      _toggleElementHighlighting("on");
    }

    function __stageMouseMoveHandler(e) {
      if (_doDrawMarquee) {

        //create shape options object
        _marqueeOptions = {
          x: _marqueeDragOffset.x,
          y: _marqueeDragOffset.y,
          backgroundColor: 0xCCCCCC,
          borderColor: "black",
          borderStyle: "dashed",
          opacity: 0.1,
          type: "rectangle",
          typeSettings: {
            sideWidth: e.stageX - _marqueeDragOffset.x,
            sideLength: e.stageY - _marqueeDragOffset.y
          }
        };

        //if the marquee doesn't equal null, it already exists and we must remove it before redrawing it
        if (_marquee !== null) {
          _stage.removeChild(_marquee);
        }

        _marquee = _drawShape(_marqueeOptions);

        _stage.addChild(_marquee);

        _doUpdate();
      }
    }

    function __canvasClickHandler() {

      //go ahead and deselect all shapes if the _doDeselectAll flag is still set
      if (_doDeselectAll) _deselectAllShapes();
    }
  }

  function _nudge(shape, direction, amount, doRedrawNow) {
    if (!shape.shapeOptions.locked) {

      //set default nudge amount
      if (!amount) amount = 1;

      //do redraw by default if nothing is specified
      if (doRedrawNow === undefined) doRedrawNow = true;

      //determine the target coordinate and add nudge amount to it, respecting bounds enforcement
      switch (direction) {
        case "up":
          if (!_enforceBounds || shape.getBounds().y - amount > 0 + _boundsBuffer) {
            shape.shapeOptions.y -= amount;
          }

          break;
        case "down":
          if (!_enforceBounds || shape.getBounds().y + amount + shape.getBounds().height < $canvas.height() - _boundsBuffer) {
            shape.shapeOptions.y += amount;
          }

          break;
        case "left":
          if (!_enforceBounds || shape.getBounds().x - amount > 0 + _boundsBuffer) {
            shape.shapeOptions.x -= amount;
          }

          break;
        case "right":
          if (!_enforceBounds || shape.getBounds().x + amount + shape.getBounds().width < $canvas.width() - _boundsBuffer) {
            shape.shapeOptions.x += amount;
          }

          break;
        default: break;
      }

      if (doRedrawNow) {

        //redraw all shapes to maintain layers
        //then deselect and reselect all currently selected shape to maintain visible bounding box
        _redrawAllAndReSelectCurrentlySelected();
      }
    }
  }

  function _redrawAllAndReSelectCurrentlySelected() {
    var groupList = _getGroupList();

    //we must remove and redraw the element(s) that were moved so that their new location is officially set
    //go ahead and remove and redraw everything so that we maintain proper layer order
    _removeAndRedrawAll();

    //loop through each currently selected shape in layer order and deselect/reselect each one at a time
    //this ensures that the bounding boxes are visible even if the shapes themselves are not visible bc they're behind other shapes
    _deselectAllShapes(false, true);

    _resyncGroupData(groupList, true);
  }

  function _resyncGroupData(groupList, doTrigger) {

    if (doTrigger === undefined) doTrigger = true;

    var groupsToAdd = [],
        shapesToAdd = [];

    $.each(groupList, function(i, currentGroup) {
      $.each(currentGroup.shapes, function(o, currentOldShape) {
        $.each(_shapes, function(u, currentShape) {
          if (currentOldShape.name == currentShape.name) {
            shapesToAdd.push(currentShape);

            return false;
          }
        });
      });

      groupsToAdd.push(shapesToAdd);
    });

    groupList = null;

    $.each(groupsToAdd, function(i, shapes) {
      _addShapesToNewGroup(shapes, doTrigger);
    });
  }

  function _deselectAllShapes(doTrigger, doReselect) {
    if (doTrigger === undefined) doTrigger = true;
    if (doReselect === undefined) doReselect = false;

    //loop through all shapes on the stage and remove each one
    $.each(_shapes, function(i, currentShape) {
      _deselectShape(currentShape, doReselect);
    });

    if (doTrigger) $canvas.trigger("shapesDeselected");
  }

  function _addShape(options, handlesOverride) {

    //draw a new shape with the given options and assign it a name for identification later
    var shape = _drawShape(options);

    //add our new shape to the stage
    _stage.addChild(shape);

    //also add our shape to an array of shapes so we can keep track of layer order, etc.
    _shapes.push(shape);

    //if this shape is selectable, add selection event handlers
    if (options.selectable) {
      _makeSelectable(shape, handlesOverride);
    }

    //draw attachments if they exist
    if (options.attachments) {
      _drawAttachments(shape);
    }

    _doUpdate();

    return shape;
  }

  function _drawAttachments(shape) {
    shape.shapeOptions = _updateAttachmentVertices(shape.shapeOptions);

    $.each(shape.shapeOptions.attachments, function(i, attachmentOptions) {

      $.when(_createAttachment(attachmentOptions, shape)).then(function(attachment) {

        _setParentShape(shape, attachment, "attachments");

        _stage.addChild(attachment);
      });
    });
  }

  function _createAttachment(options, shape) {

    var attachmentId = options.location.anchor.split(":")[1];
    if (options.location.anchor.indexOf("line") > -1) attachmentId += "_" + (parseInt(options.location.anchor.split(":")[1]) + 1).toString();
    options.name = shape.name + "_attachment" + attachmentId;

    var promise = $.Deferred(),
        attachmentOptions;

    var originIndex = parseInt(options.location.anchor.substring(5));
    var endPointIndex = shape.shapeOptions.typeSettings.vertices.length >= (originIndex + 2) ? originIndex + 1 : 0;

    var origin = shape.shapeOptions.typeSettings.vertices[originIndex];
    var endPoint = shape.shapeOptions.typeSettings.vertices[endPointIndex];

    var deltaX = (endPoint.x - origin.x);
    var deltaY = (endPoint.y - origin.y);

    var theta = Math.atan2(deltaY, deltaX);

    if (options.type === "image") {

      attachmentOptions = {
        name: options.name,
        x: options.location.vertex.x + shape.shapeOptions.x + shape.shapeOptions.typeSettings.vertices[0].x,// - (options.typeSettings.height / 2),
        y: options.location.vertex.y + shape.shapeOptions.y + shape.shapeOptions.typeSettings.vertices[0].y,// - (options.typeSettings.width / 2),
        height: options.typeSettings.height,
        width: options.typeSettings.width,
        src: options.typeSettings.src,
        orientation: options.orientation
      };

      $.when(_drawBitmap(attachmentOptions, theta)).then(function(bitmap) {

        bitmap.name = options.name;

        bitmap.on("mouseover", function() {
          $(shape).trigger("attachment_mouseover");
        });

        bitmap.on("mouseout", function() {
          $(shape).trigger("attachment_mouseout");
        });

        bitmap.on("pressup", function() {
          $(shape).trigger("attachment_pressup");
        });

        bitmap.on("mousedown", function() {
          $(shape).trigger("attachment_mousedown");
        });

        promise.resolve(bitmap);
      });
    } else {

      var attachmentX = options.location.vertex.x + shape.shapeOptions.x + shape.shapeOptions.typeSettings.vertices[0].x,
          attachmentY = options.location.vertex.y + shape.shapeOptions.y + shape.shapeOptions.typeSettings.vertices[0].y;

      if (options.type === "square") {
        attachmentX -= options.typeSettings.sideLength / 2;
        attachmentY -= options.typeSettings.sideLength / 2;
      } else if (options.type === "rectangle") {
        attachmentX -= options.typeSettings.sideWidth / 2;
        attachmentY -= options.typeSettings.sideLength / 2;
      }

      attachmentOptions = {
        name: options.name,
        x: attachmentX,
        y: attachmentY,
        backgroundColor: options.backgroundColor,
        borderColor: options.borderColor,
        type: options.type,
        typeSettings: options.typeSettings,
        orientation: options.orientation
      };

      var newShape = _drawShape(attachmentOptions, theta);

      newShape.on("mouseover", function() {
        $(shape).trigger("attachment_mouseover");
      });

      newShape.on("mouseout", function() {
        $(shape).trigger("attachment_mouseout");
      });

      newShape.on("pressup", function() {
        $(shape).trigger("attachment_pressup");
      });

      newShape.on("mousedown", function() {
        $(shape).trigger("attachment_mousedown");
      });

      promise.resolve(newShape);
    }

    return promise;
  }

  function _drawShape(options, theta) {

    //create a new shape and set its name property
    shape = new createjs.Shape();
    shape.name = options.name;

    //set locked flag if not already set but should be
    if (!options.draggable && !options.adjustable && !options.resizable) {
      options.locked = true;
    }
    //init/clear handles and attachments arrays since we always recalculate handles on redraw
    shape.handles = [];
    shape.attachments = [];

    //create our fill and stroke from the given options
    if (options.backgroundGradient) {
      shape.graphics.beginLinearGradientFill(options.backgroundGradient.colors, options.backgroundGradient.ratios, options.backgroundGradient.x0, options.backgroundGradient.y0, options.backgroundGradient.x1, options.backgroundGradient.y1);
    } else if (options.backgroundColor !== undefined) {

      //set default background color and override if a backgroundColor is specified
      var backgroundColor = "#cccccc";

      if (typeof options.backgroundColor === "number") backgroundColor = createjs.Graphics.getRGB(options.backgroundColor, options.opacity ? options.opacity : null);
      else backgroundColor = options.backgroundColor;

      shape.graphics.beginFill(backgroundColor);
    }

    //set default border color and override if a borderColor is specified
    var borderColor = "black";
    if (options.borderColor) {
      if (typeof options.borderColor === "number") borderColor = createjs.Graphics.getRGB(options.borderColor, null);
      else borderColor = options.borderColor;

      if (borderColor === "transparent") borderColor = createjs.Graphics.getRGB(0x000000, 0);
    }

    shape.graphics.beginStroke(borderColor);

    //turn resizable shapes into polygons
    if (options.resizable && (options.type == "square" || options.type == "rectangle")) {

      var vertex0 = { x: 0, y: 0 };
      var vertex1 = { x: options.typeSettings.sideWidth ? options.typeSettings.sideWidth : options.typeSettings.sideLength, y: 0 };
      var vertex2 = { x: options.typeSettings.sideWidth ? options.typeSettings.sideWidth : options.typeSettings.sideLength, y: options.typeSettings.sideLength };
      var vertex3 = { x: 0, y: options.typeSettings.sideLength };

      options.typeSettings = {
        vertices: [vertex0, vertex1, vertex2, vertex3]
      };

      if (options.type == "square") options.maintainAspectRatio = true;

      options.type = "polygon";
    }

    //draw our shape, depending on the type specified in the options
    switch (options.type) {
      case "line":
        shape.graphics.moveTo(options.x + options.typeSettings.vertices[0].x, options.y + options.typeSettings.vertices[0].y);
        shape.graphics.lineTo(options.x + options.typeSettings.vertices[1].x, options.y + options.typeSettings.vertices[1].y);

        break;
      case "square":
        if (options.borderStyle && options.borderStyle == "dashed") {
          _drawDashedRect(shape.graphics, options.x, options.y, options.typeSettings.sideLength, options.typeSettings.sideLength, 3);
        } else {
          shape.graphics.drawRect(options.x, options.y, options.typeSettings.sideLength, options.typeSettings.sideLength);
        }

        break;
      case "rectangle":
        if (options.borderStyle && options.borderStyle == "dashed") {
          _drawDashedRect(shape.graphics, options.x, options.y, options.typeSettings.sideWidth, options.typeSettings.sideLength, 3);
        } else {
          shape.graphics.drawRect(options.x, options.y, options.typeSettings.sideWidth, options.typeSettings.sideLength);
        }

        break;
      case "circle":

        shape.graphics.drawCircle(options.x, options.y, options.typeSettings.radius);

        break;
      case "polygon":

        //loop through each vertex and draw our polygon
        $.each(options.typeSettings.vertices, function(i, vertex) {
          if (i === 0) shape.graphics.moveTo(options.x + vertex.x, options.y + vertex.y);
          else shape.graphics.lineTo(options.x + vertex.x, options.y + vertex.y);
        });
        shape.graphics.closePath();

        //if multiple colors are specified for borders, draw the polygon again with those border colors
        if (options.typeSettings.vertexColors !== undefined && Object.keys(options.typeSettings.vertexColors).length > 0) {

          var vertexColor;
          $.each(options.typeSettings.vertices, function(i, vertex) {

            //determine this vertex color
            if (options.typeSettings.vertexColors[i] !== undefined) {
              vertexColor = options.typeSettings.vertexColors[i];

              if (typeof vertexColor === "number") {
                vertexColor = createjs.Graphics.getRGB(vertexColor, null);
              }
              if (vertexColor === "transparent") {
                vertexColor = createjs.Graphics.getRGB(0x000000, 0.1);
              }
            } else {
              vertexColor = borderColor;
            }

            //this code more or less apes the example here:
            //http://jsfiddle.net/crittelmeyer/7sZFc/
            if (i !== 0) shape.graphics.lineTo(vertex.x + options.x, vertex.y + options.y);
            shape.graphics.beginStroke(vertexColor);
            shape.graphics.moveTo(vertex.x + options.x, vertex.y + options.y);
          });

          shape.graphics.lineTo(options.typeSettings.vertices[0].x + options.x, options.typeSettings.vertices[0].y + options.y);
        }

        break;
      default:
        break;
    }

    if (options.orientation && options.orientation === "followShape") {
      shape.rotation = (theta * 180) / Math.PI;
    }

    shape.shapeOptions = options;

    return shape;
  }

  function _drawBitmap(options, theta) {

    var promise = $.Deferred();

    if (!_attachmentImages[options.name]) {
      var img = new Image();
      img.src = options.src;

      $(img).load(function() {
        _attachmentImages[options.name] = this;

        promise.resolve(__createBitmap(_attachmentImages[options.name], options, theta));
      });
    } else {

      promise.resolve(__createBitmap(_attachmentImages[options.name], options, theta));
    }

    function __createBitmap(img, options, theta) {
      var bitmap = new createjs.Bitmap(img);

      bitmap.x = options.x;
      bitmap.y = options.y;
      bitmap.scaleX = (options.height / img.height);
      bitmap.scaleY = (options.width / img.width);
      if (options.orientation === "followShape") {
        bitmap.rotation = (theta * 180) / Math.PI; //converting radians to degrees
      }

      return bitmap;
    }

    return promise;
  }

  function _makeSelectable(shape, handlesOverride) {

    //if we are in the middle of adjusting, we can go ahead and makeAdjustable immediately -> otherwise, our adjustment handles disappear
    if (_adjusting && shape.shapeOptions.adjustable) {
      //add adjustment handles
      _makeAdjustable(shape, handlesOverride);
    } else if (_adjusting && shape.shapeOptions.resizable) {
      _makeResizable(shape, handlesOverride);
    } else {

      //if the shape is locked we should bind these actions first
      if (shape.shapeOptions.locked) {

        //bind all of our ui actions
        if (shape.boundingBox) __bindUIActions(shape.boundingBox);
        else __bindUIActions(shape);
      }

      //if the shape is already selected, apply needed action handlers
      if (_currentlySelected.length > 0) {
        $.each(_currentlySelected, function(i, item) {
          if (item == shape.name || item == "bounding_" + shape.name) {
            _makeCurrentlySelected(shape, handlesOverride);
          }
        });
      }

      //if the shape is unlocked we should bind these actions after
      if (!shape.shapeOptions.locked) {
        //bind all of our ui actions
        if (shape.boundingBox) __bindUIActions(shape.boundingBox);
        else __bindUIActions(shape);
      }
    }

    function __bindUIActions(target) {
      if (shape.boundingShape) $(shape.boundingShape).on("selected", ___shapeSelectedHandler);
      else $(shape).on("selected", ___shapeSelectedHandler);
      if (shape.boundingShape) $(shape.boundingShape).on("deselected", ___shapeDeselectedHandler);
      else $(shape).on("deselected", ___shapeDeselectedHandler);

      target.on("mouseover", ___shapeMouseOverHandler);
      target.on("mouseout", ___shapeMouseOutHandler);
      target.on("pressup", ___shapePressUpHandler);
      target.on("mousedown", ___shapeMouseDownHandler);

      // create handlers that get triggered when attachments are interacted with
      // essentially, these triggers ensure that interacting with attachments is
      // the same as interacting with the shape itself. The shape handler, in turn,
      // loops through attachments and adds behaviors to them. For example, clicking an
      // attachment should select the shape (if it's selectable). Dragging an
      // attachment drags the shape (which in turn drags all of its attachments along with it)
      $(shape).on("attachment_mouseover", ___shapeMouseOverHandler);
      $(shape).on("attachment_mouseout", ___shapeMouseOutHandler);
      $(shape).on("attachment_pressup", ___shapePressUpHandler);
      $(shape).on("attachment_mousedown", ___shapeMouseDownHandler);

      function ___shapeSelectedHandler() {

        //set the isSelected flag
        this.isSelected = true;
      }

      function ___shapeDeselectedHandler() {

        //clear the isSelected flag
        this.isSelected = false;
      }

      function ___shapeMouseOverHandler() {

        //determine if the shape is already hovered over
        var notCurrentlyHovered = (!_currentlyHoveringOver || _currentlyHoveringOver != this.name);

        //if the shape is neither selected nor hovered, show the hover view
        //otherwise hide the hover view
        _changeDisplayState(this, (!_shapeIsSelected(this) && notCurrentlyHovered ? "shapeMouseOver" : "shapeMouseOut"));

        //if the modifier 1 hot key is being pressed and the shape being moused over isn't already selected, change the cursor to "copy"
        if (_keyIsPressed(_keyMap.MODIFIER_1) && !_shapeIsSelected(this)) this.cursor = "copy";
      }

      function ___shapeMouseOutHandler() {

        //determine if we were in hover mode (as opposed to both hover & selected) and if so, hide the hover view
        if (_currentlyHoveringOver && _currentlyHoveringOver == this.name) {
          _changeDisplayState(this, "shapeMouseOut");
        }
      }

      function ___shapePressUpHandler() {
        //if ctrl isn't being pressed, deselect any other shapes that might already be selected
        if (!_keyIsPressed(_keyMap.MODIFIER_1) && !this.isSelected) {
          if (!this.boundingShape || (this.boundingShape && !this.boundingShape.isSelected)) {
            _deselectAllShapes();
          }
        }

        //hack: set this variable to false to indicate whether a shape was clicked or just the stage
        _doDeselectAll = false;

        if (!_shapeIsSelected(this)) {

          //display selection indicators and add event handlers
          _makeCurrentlySelected(this, null, true);

          //remove any visual changes added on mouseover
          _changeDisplayState(this, "shapeMouseOut");
        }
      }

      function ___shapeMouseDownHandler() {

        //prevent marquee drawing
        _doDrawMarquee = false;
      }
    }
  }

  function _shapeIsSelected(shape) {
    return $.inArray(shape.name, _currentlySelected) > -1 || $.inArray("bounding_" + shape.name, _currentlySelected) > -1;
  }

  function _keyIsPressed(keyCode) {
    var keyPressed = false;
    if (_currentKeysPressed.length > 0) {
      $.each(_currentKeysPressed, function(i, key) {
        if (key == keyCode) {
          keyPressed = true;
          return false;
        }
      });
    }

    return keyPressed;
  }

  function _changeDisplayState(shape, type) {
    switch (type) {
      case "shapeMouseOver":
        _currentlyHoveringOver = shape.name;
        shape.shadow = new createjs.Shadow("#333333", 2, 2, 4);

        //loop through the shape's attachments and give them the same "hover" look
        $.each(shape.attachments, function(i, attachment) {
          attachment.shadow = new createjs.Shadow("#333333", 2, 2, 4);
        });

        break;
      case "shapeMouseOut":
        _currentlyHoveringOver = null;
        shape.shadow = null;

        //loop through the shape's attachments and remove the "hover" look
        $.each(shape.attachments, function(i, attachment) {
          attachment.shadow = null;
        });

        break;
      default:
        break;
    }

    _doUpdate();
  }

  function _makeAdjustable(shape, handlesOverride) {
    if (handlesOverride) {
      $.each(handlesOverride, function(i, handle) {
        _setParentShape(shape, handle, "handles");
      });
    } else {

      $.each(shape.shapeOptions.typeSettings.vertices, function(i, vertex) {
        var handleOptions = _getHandleOptions("adjustable", shape.shapeOptions, vertex);
        var handle = _createHandle("adjustable", handleOptions, i);

        _setParentShape(shape, handle, "handles");

        _stage.addChild(handle);
      });

      _calculateBounds(shape.shapeOptions.typeSettings.vertices, shape);
    }
  }

  function _getHandleOptions(type, shapeOptions, vertex) {
    var handleOptions,
        handleLength;

    switch (type) {
      case "adjustable":
        handleLength = 8;
        handleOptions = {
          x: shapeOptions.x + vertex.x,
          y: shapeOptions.y + vertex.y,
          backgroundColor: 0x000,
          borderColor: 0x000,
          opacity: 0.01,
          type: "circle",
          typeSettings: {
            radius: (handleLength / 2)
          }
        };

        break;
      case "resizable":
        handleLength = 8;
        handleOptions = {
          x: shapeOptions.x + vertex.x - (handleLength / 2),
          y: shapeOptions.y + vertex.y - (handleLength / 2),
          backgroundGradient: {
            colors: ["#e5e5e5", "#ccc"],
            ratios: [0.6, 1],
            x0: 0,
            y0: shapeOptions.y + vertex.y - (handleLength / 2),
            x1: 0,
            y1: shapeOptions.y + vertex.y - (handleLength / 2) + handleLength
          },
          borderColor: 0xccc,
          type: "square",
          typeSettings: {
            sideLength: handleLength
          }
        };

        break;
      case "selectable":
        handleLength = 6;
        handleOptions = {
          x: shapeOptions.x + vertex.x - (handleLength / 2),
          y: shapeOptions.y + vertex.y - (handleLength / 2),
          backgroundColor: "black",
          borderColor: shapeOptions.locked ? 0xFF0000 : 0x000000,
          type: "square",
          typeSettings: {
            sideLength: handleLength
          }
        };

        break;
      default:
        break;
    }

    //override handle options if specified in shapeOptions
    if (shapeOptions[type + "Settings"] !== undefined && shapeOptions[type + "Settings"].handles !== undefined && Object.keys(shapeOptions[type + "Settings"].handles).length > 0) {
      for (var propertyName in shapeOptions[type + "Settings"].handles) {
        handleOptions[propertyName] = shapeOptions[type + "Settings"].handles[propertyName];
      }
    }

    return handleOptions;
  }

  function _setParentShape(shape, child, type) {

    child.parentShape = shape;

    if (Object.prototype.toString.call(child.parentShape[type]) === "[object Array]") {
      child.parentShape[type].push(child);
    } else {
      child.parentShape[type] = child;
    }

    $(shape).trigger("childAdded", [child]);
    //sort of a hacky fix - trigger childAdded once, then trigger it again in the near future since some handlers for this event may not get added until after
    setTimeout(function() {
      $(shape).trigger("childAdded", [child]);
    }, 300);
  }

  function _toggleElementHighlighting(mode) {

    var value = "";
    if (mode === "off") value = "none";

    $body.css({
      "-webkit-user-select": value,
      "-moz-user-select": value,
      "user-select": value
    });
  }

  function _createHandle(type, handleOptions, vertexIndex) {
    handleOptions.name = "handle" + vertexIndex;

    var newHandle = _drawShape(handleOptions);

    if (type === "adjustable") {
      __bindUIActions_adjustable();
    } else if (type === "selectable") {
      __bindUIActions_selectable();
    } else if (type === "resizable") {
      __bindUIActions_resizable();
    }

    function __bindUIActions_adjustable() {
      newHandle.on("mouseover", ___handleMouseOverHandler);
      newHandle.on("mousedown", ___handleMouseDownHandler);
      newHandle.on("pressmove", ___handlePressMoveHandler);
      newHandle.on("pressup", ___handlePressUpHandler);

      function ___handleMouseOverHandler() {
        //set the cursor to pointer
        this.cursor = "pointer";
      }

      function ___handleMouseDownHandler(e) {
        //don't display the marquee square
        _doDrawMarquee = false;

        //set _adjusting flag
        _adjusting = true;

        //store current offset of selected adjustment handle
        _adjustmentOffset = { x: this.x - e.stageX, y: this.y - e.stageY };

        //determine the click location offset since easeljs hides this
        _clickLocationOffset = {
          x: Math.abs(_adjustmentOffset.x) - this.parentShape.shapeOptions.x - this.parentShape.shapeOptions.typeSettings.vertices[this.vertexIndex].x,
          y: Math.abs(_adjustmentOffset.y) - this.parentShape.shapeOptions.y - this.parentShape.shapeOptions.typeSettings.vertices[this.vertexIndex].y
        };

        //turn off html element highlighting while resizing shapes
        _toggleElementHighlighting("off");
      }

      function ___handlePressMoveHandler(e) {

        //store current vertex index
        var vertexIndex = this.vertexIndex,
            shapeName = this.parentShape.name;

        //store new x & y
        var newX = e.stageX + _adjustmentOffset.x;
        var newY = e.stageY + _adjustmentOffset.y;

        //update handle location
        this.x = newX;
        this.y = newY;

        //calculate the matching vertex by removing the click location offset
        var matchingVertex = {
          x: Math.abs(_adjustmentOffset.x) - this.parentShape.shapeOptions.x - _clickLocationOffset.x,
          y: Math.abs(_adjustmentOffset.y) - this.parentShape.shapeOptions.y - _clickLocationOffset.y
        };

        //calculate new vertex coordinates
        var newVertex = {
          x: matchingVertex.x + newX,
          y: matchingVertex.y + newY
        };

        //create variable for new options, default to old options
        var newOptions = this.parentShape.shapeOptions;

        //look for other shapes that specify this shape in vertex mirror(s) and update them
        $.each(_shapes, function(i, currentShape) {

          ____adjustMirrorVertices(currentShape, currentShape.shapeOptions);
        });

        //update our newOptions object with the modified vertices
        newOptions.typeSettings.vertices[vertexIndex] = newVertex;

        //store the layer index of the shape being adjusted so that we can restore the layer order later
        var that = this;
        if (_currentlyAdjustingLayerIndex === null) {
          $.each(_shapes, function(i, currentShape) {
            if (currentShape.name == that.parentShape.name) {
              _currentlyAdjustingLayerIndex = i;

              return false;
            }
          });
        }

        //erase the shape we are modifying and redraw with new options
        this.parentShape.shapeOptions = newOptions;
        _removeAndRedraw(this.parentShape, this.parentShape.handles);

        _doUpdate();

        function ____adjustMirrorVertices(shape, shapeOptions) {

          //check for existence of vertex mirrors
          if (shapeOptions.typeSettings.vertexMirrors !== undefined) {

            //loop through vertex mirrors
            $.each(shapeOptions.typeSettings.vertexMirrors, function (key, val) {

              //see if any match the current vertex
              if (shapeName + ":" + vertexIndex === val) {

                if (!_mirrorOffset) {
                  _mirrorOffset = {};
                }

                if (!_mirrorOffset[shape.name]) {

                  _mirrorOffset[shape.name] = {
                    x: (shapeOptions.typeSettings.vertices[key].x + shapeOptions.x) - (newOptions.typeSettings.vertices[vertexIndex].x + newOptions.x),
                    y: (shapeOptions.typeSettings.vertices[key].y + shapeOptions.y) - (newOptions.typeSettings.vertices[vertexIndex].y + newOptions.y)
                  };
                }

                //calculate the matching vertex by removing the click location offset
                var mirrorVertex = {
                  x: Math.abs(_adjustmentOffset.x) - shapeOptions.x - _clickLocationOffset.x + _mirrorOffset[shape.name].x,
                  y: Math.abs(_adjustmentOffset.y) - shapeOptions.y - _clickLocationOffset.y + _mirrorOffset[shape.name].y
                };

                var newMirrorVertex = {
                  x: mirrorVertex.x + newX,
                  y: mirrorVertex.y + newY
                };

                shapeOptions.typeSettings.vertices[key] = newMirrorVertex;

                shape.shapeOptions = shapeOptions;
                _removeAndRedraw(shape);
              }
            });
          }
        }
      }

      function ___handlePressUpHandler() {

        //don't de-select all shapes
        _doDeselectAll = false;

        //unset _adjusting flag
        _adjusting = false;

        //clear _mirrorOffset object in case offset is manually changed
        _mirrorOffset = null;

        // re-order _shapes array so that it matches what it was before the shape began adjusting
        var topLayerShape = _shapes.splice(_shapes.length - 1, 1)[0];
        _shapes.splice(_currentlyAdjustingLayerIndex, 0, topLayerShape);
        _currentlyAdjustingLayerIndex = null;

        //redraw all shapes to maintain layers
        //then deselect and reselect all currently selected shape to maintain visible bounding box
        _redrawAllAndReSelectCurrentlySelected();

        //turn html element highlighting back on
        _toggleElementHighlighting("on");

        _doUpdate();
      }
    }

    function __bindUIActions_selectable() {
      newHandle.on("mousedown", ___handleMouseDownHandler);

      function ___handleMouseDownHandler() {

        //don't display the marquee square
        _doDrawMarquee = false;
      }
    }

    function __bindUIActions_resizable() {
      newHandle.on("mouseover", ___handleMouseOverHandler);
      newHandle.on("mousedown", ___handleMouseDownHandler);
      newHandle.on("pressmove", ___handlePressMoveHandler);
      newHandle.on("pressup", ___handlePressUpHandler);

      function ___handleMouseOverHandler() {
        switch (this.vertexIndex) {
          case 0: this.cursor = "nw-resize"; break;
          case 1: this.cursor = "ne-resize"; break;
          case 2: this.cursor = "se-resize"; break;
          case 3: this.cursor = "sw-resize"; break;
        }
      }

      function ___handleMouseDownHandler(e) {
        //don't display the marquee square
        _doDrawMarquee = false;

        //set _adjusting flag
        _adjusting = true;

        //store current offset of selected adjustment handle
        _resizeOffset = { x: this.x - e.stageX, y: this.y - e.stageY };

        //determine the click location offset since easeljs hides this
        var currentShape = this.parentShape.boundingShape ? this.parentShape.boundingShape : this.parentShape;
        _clickLocationOffset = {
          x: Math.abs(_resizeOffset.x) - currentShape.shapeOptions.x - currentShape.shapeOptions.typeSettings.vertices[this.vertexIndex].x,
          y: Math.abs(_resizeOffset.y) - currentShape.shapeOptions.y - currentShape.shapeOptions.typeSettings.vertices[this.vertexIndex].y
        };

        //turn off html element highlighting while resizing shapes
        _toggleElementHighlighting("off");
      }

      function ___handlePressMoveHandler(e) {
        var currentX = e.stageX + _resizeOffset.x,
            currentY = e.stageY + _resizeOffset.y,
            newX = currentX,
            newY = currentY,
            newWidth,
            newHeight;

        //we store current width and height so we can make comparisons later
        //if currentWidth is not already initialized, initialize it here
        if (!_currentWidth) {
          _currentWidth = this.parentShape.boundingShape.getBounds().width;
          _currentHeight = this.parentShape.boundingShape.getBounds().height;
          _currentAspectRatio = _currentWidth / _currentHeight;
        }

        //default min width and min height constraints
        var minWidth = 10;
        var minHeight = 10;

        //override default min width and height constraints, if specified
        if (this.parentShape.boundingShape.shapeOptions.minWidth) minWidth = this.parentShape.boundingShape.shapeOptions.minWidth;
        if (this.parentShape.boundingShape.shapeOptions.minHeight) minHeight = this.parentShape.boundingShape.shapeOptions.minHeight;

        //check for minimum width constraint and apply if enabled
        if (minWidth) {
          if (this.vertexIndex === 1 || this.vertexIndex === 2) {
            var minX = (-1 * _currentWidth) + minWidth;
            if (newX <= minX) newX = minX;
          } else {
            var maxX = _currentWidth - minWidth;
            if (newX >= maxX) newX = maxX;
          }
        }

        //check for minimum height constraint and apply if enabled
        if (minHeight) {
          if (this.vertexIndex === 3 || this.vertexIndex === 2) {
            var minY = (-1 * _currentHeight) + minHeight;
            if (newY <= minY) newY = minY;
          } else {
            var maxY = _currentHeight - minHeight;
            if (newY >= maxY) newY = maxY;
          }
        }

        //default max width and max height constraints
        var maxWidth = 300;
        var maxHeight = 300;

        //override default max width and height constraints, if specified
        if (this.parentShape.boundingShape.shapeOptions.maxWidth) maxWidth = this.parentShape.boundingShape.shapeOptions.maxWidth;
        if (this.parentShape.boundingShape.shapeOptions.maxHeight) maxHeight = this.parentShape.boundingShape.shapeOptions.maxHeight;

        //check for maximum width constraint and apply if enabled
        if (maxWidth) {
          if (this.vertexIndex === 1 || this.vertexIndex === 2) {
            var maxX = (-1 * _currentWidth) + maxWidth;
            if (newX >= maxX) newX = maxX;
          } else {
            var maxX = _currentWidth - maxWidth;
            if (newX <= maxX) newX = maxX;
          }
        }

        //check for maximum height constraint and apply if enabled
        if (maxHeight) {
          if (this.vertexIndex === 3 || this.vertexIndex === 2) {
            var maxY = (-1 * _currentHeight) + maxHeight;
            if (newY >= maxY) newY = maxY;
          } else {
            var maxY = _currentHeight - maxHeight;
            if (newY <= maxY) newY = maxY;
          }
        }

        //        //update x values, but check for canvas boundaries
        //        var boundsOffsetX;
        //        if (_enforceBounds === false
        //          || ((($canvas.width() > _boundsBuffer + this.parentShape.boundingShape.getBounds().x + this.parentShape.boundingShape.getBounds().width)
        ////            || ((currentX - this.x) < 0))
        //            )  && ((_boundsBuffer < this.parentShape.boundingShape.getBounds().x)
        //              || ((currentX - this.x) > 0)))
        //          ) {
        //
        //console.log("no prob with x", $canvas.width(), ">", _boundsBuffer + this.parentShape.boundingShape.getBounds().x + this.parentShape.boundingShape.getBounds().width);
        //
        //          //set offset amount which will be subtracted from new x to keep us in bounds
        //          boundsOffsetX = 0;
        //        } else {
        //
        //          var actualX = this.parentShape.boundingShape.getBounds().x;
        //          var actualXPlusWidth = actualX + this.parentShape.boundingShape.getBounds().width;
        //          var actualBoundsX = $canvas.width() - _boundsBuffer;
        //
        //          //if we go too far right
        //          if (actualXPlusWidth >= actualBoundsX) {
        //
        //console.log("too far right!", this.x, currentX, actualXPlusWidth, actualBoundsX);
        //
        //            boundsOffsetX = (actualXPlusWidth - actualBoundsX) + (currentX - this.x);
        //          //if we go too far left
        //          } else if (actualX - this.parentShape.boundingShape.getBounds().width < 0) {
        //
        //console.log("too far left!", this.x, currentX, actualX, _boundsBuffer);
        //
        //            boundsOffsetX = (actualX - _boundsBuffer);
        //          }
        //        }
        //
        //
        //        //update y values, but check for canvas boundaries
        //        var boundsOffsetY;
        //        if (_enforceBounds === false
        //          || ((($canvas.height() > _boundsBuffer + this.parentShape.boundingShape.getBounds().y + this.parentShape.boundingShape.getBounds().height)
        //            || ((currentY - this.y) < 0))
        //            && ((_boundsBuffer < this.parentShape.boundingShape.getBounds().y)
        //              || ((currentY - this.y) > 0)))
        //          ) {
        //
        ////console.log("no prob with y");
        //
        //          //update the selected handle's y location to match the mouse location
        //          boundsOffsetY = 0;
        //        } else {
        //
        //          var actualY = this.parentShape.boundingShape.getBounds().y;
        //          var actualYPlusHeight = actualY + this.parentShape.boundingShape.getBounds().height;
        //          var actualBoundsY = $canvas.height() - _boundsBuffer;
        //
        //          //if we go too far down
        //          if (actualYPlusHeight >= actualBoundsY) {
        //
        //console.log("too far down!", currentY, actualYPlusHeight, actualBoundsY);
        //
        //            boundsOffsetY = (actualYPlusHeight - actualBoundsY) + (currentY - this.y);
        //          //if we go too far up
        //          } else if (actualY - this.parentShape.boundingShape.getBounds().height < 0) {
        //
        //console.log("too far up!", currentY, actualY, _boundsBuffer);
        //
        //            boundsOffsetY = (actualY - _boundsBuffer);
        //          }
        //        }
        //
        //        if (boundsOffsetX > boundsOffsetY) boundsOffsetY = boundsOffsetX;
        //        else if (boundsOffsetY > boundsOffsetX) boundsOffsetX = boundsOffsetY;
        //
        //        var actualNewX = newX - boundsOffsetX;
        //        var actualNewY = newY - boundsOffsetY;
        //
        //
        //console.log("new x", newX, "-", boundsOffsetX, "=", actualNewX);
        //console.log("new y", newY, "-", boundsOffsetY, "=", actualNewY);
        //

        //maintain aspect ratio if needed
        if (this.parentShape.boundingShape.shapeOptions.maintainAspectRatio) {
          //          if (actualXPlusWidth >= actualBoundsX) {
          ////console.log("boom", actualNewX, this.x, currentX, actualNewY, this.y, currentY);
          //            console.log("boom", currentY - this.y);
          //            if (actualNewX < this.x) actualNewX = this.x;
          //
          //            actualNewY = actualNewX / _currentAspectRatio;
          //            if (this.vertexIndex === 1 || this.vertexIndex === 3) actualNewY *= -1;
          //          } else {
          if (Math.abs(newY) > Math.abs(newX)) {
            newX = newY * _currentAspectRatio;
            if (this.vertexIndex === 1 || this.vertexIndex === 3) newX *= -1;
          } else {
            newY = newX / _currentAspectRatio;
            if (this.vertexIndex === 1 || this.vertexIndex === 3) newY *= -1;
          }
          //          }
        }
        //console.log("2", actualNewX, actualNewY);
        //
        //
        ////console.log("bounds", boundsOffsetX, boundsOffsetY);
        //
        //
        //
        //          ____updateHandleLocation(this, "x", actualNewX, boundsOffsetX);
        //          ____updateHandleLocation(this, "y", actualNewY, boundsOffsetY);
        //
        //
        //        function ____updateHandleLocation(handle, type, value, boundsOffset) {
        //          handle[type] = value;
        //
        //          switch (handle.vertexIndex) {
        //            case 0:
        //              if (type === "x") handle.parentShape.handles[3].x = value;
        //              if (type === "y") handle.parentShape.handles[1].y = value;
        //
        //              if (type === "x") newWidth = _currentWidth - value;
        //              if (type === "y") newHeight = _currentHeight - value;
        //
        //              break;
        //            case 1:
        //              if (type === "y") handle.parentShape.handles[0].y = value;
        //              if (type === "x") handle.parentShape.handles[2].x = value;
        //
        //              if (type === "x") newWidth = _currentWidth + value;
        //              if (type === "y") newHeight = _currentHeight - value;
        //
        //              break;
        //            case 2:
        //              if (type === "x") handle.parentShape.handles[1].x = value;
        //              if (type === "y") handle.parentShape.handles[3].y = value;
        //
        //              if (type === "x") {
        //                newWidth = _currentWidth + value;
        //                  //- boundsOffset;
        //console.log("new width, height", _currentWidth, "+", value, "-", boundsOffset, "=", newWidth);
        //              }
        //              if (type === "y") {
        //                newHeight = _currentHeight + value;
        ////                - boundsOffset;
        //              }
        //
        //              break;
        //            case 3:
        //              if (type === "y") handle.parentShape.handles[2].y = value;
        //              if (type === "x") handle.parentShape.handles[0].x = value;
        //
        //              if (type === "x") newWidth = _currentWidth - value;
        //              if (type === "y") newHeight = _currentHeight + value;
        //
        //              break;
        //            default:
        //              break;
        //          }
        //        }

        //update the selected handle's location to match the mouse location
        this.x = newX;
        this.y = newY;

        //when a vertex moves, adjacent vertices should also move
        switch (this.vertexIndex) {
          case 0:
            this.parentShape.handles[3].x = newX;
            this.parentShape.handles[1].y = newY;

            newWidth = _currentWidth - newX;
            newHeight = _currentHeight - newY;

            break;
          case 1:
            this.parentShape.handles[0].y = newY;
            this.parentShape.handles[2].x = newX;

            newWidth = _currentWidth + newX;
            newHeight = _currentHeight - newY;

            break;
          case 2:
            this.parentShape.handles[1].x = newX;
            this.parentShape.handles[3].y = newY;

            newWidth = _currentWidth + newX;
            newHeight = _currentHeight + newY;

            break;
          case 3:
            this.parentShape.handles[2].y = newY;
            this.parentShape.handles[0].x = newX;

            newWidth = _currentWidth - newX;
            newHeight = _currentHeight + newY;

            break;
          default:
            break;
        }

        //get new scale factor & apply to all vertices in parentShape, then redraw
        var newWidthScale = newWidth / _currentWidth;
        var newHeightScale = newHeight / _currentHeight;

        //recalculate vertices with new scaling factors
        var currentShape = this.parentShape.boundingShape ? this.parentShape.boundingShape : this.parentShape;
        var scaledVertices = _calculateScaledVertices(currentShape.shapeOptions.typeSettings.vertices, newWidthScale, newHeightScale);

        _currentWidthScale = newWidthScale;
        _currentHeightScale = newHeightScale;

        //create variable for new options, default to old options
        var newOptions = currentShape.shapeOptions;

        //update our newOptions object with the modified vertices
        newOptions.typeSettings.vertices = scaledVertices;

        //store the layer index of the shape being resized so that we can restore the layer order later
        var that = this;
        if (_currentlyResizingLayerIndex === null) {
          $.each(_shapes, function(i, currentShape) {
            if (currentShape.name == that.parentShape.boundingShape.name) {
              _currentlyResizingLayerIndex = i;

              return false;
            }
          });
        }

        //store group list so we can resync later
        var groupList = _getGroupList();

        // erase the shape we are modifying and redraw with new options
        this.parentShape.boundingShape.shapeOptions = newOptions;
        _removeAndRedraw(this.parentShape.boundingShape, this.parentShape.handles);

        //resync the group data on the new shape(s)
        _resyncGroupData(groupList, false);

        _doUpdate();
      }

      function ___handlePressUpHandler() {
        //don't de-select all shapes
        _doDeselectAll = false;

        //unset _adjusting flag
        _adjusting = false;

        _currentLocationX = null;
        _currentLocationY = null;

        // re-order _shapes array so that it matches what it was before the shape began resizing
        var topLayerShape = _shapes.splice(_shapes.length - 1, 1)[0];
        _shapes.splice(_currentlyResizingLayerIndex, 0, topLayerShape);
        _currentlyResizingLayerIndex = null;

        //redraw all shapes to maintain layers
        //then deselect and reselect all currently selected shape to maintain visible bounding box
        _redrawAllAndReSelectCurrentlySelected();

        _currentWidth = null;
        _currentHeight = null;
        _currentAspectRatio = null;
        _currentWidthScale = null;
        _currentHeightScale = null;

        //turn html element highlighting back on
        _toggleElementHighlighting("on");

        _doUpdate();
      }
    }

    //store the index of the vertex for easy access later
    newHandle.vertexIndex = vertexIndex;

    return newHandle;
  }

  function _updateAttachmentVertices(options) {
    $.each(options.attachments, function(i, attachment) {
      if (attachment.location.anchor.indexOf("line:") === 0) {

        var originIndex = parseInt(attachment.location.anchor.substring(5));
        var endPointIndex = options.typeSettings.vertices.length >= (originIndex + 2) ? originIndex + 1 : 0;
        var origin = options.typeSettings.vertices[originIndex];
        var endPoint = options.typeSettings.vertices[endPointIndex];

        var deltaX = (endPoint.x - origin.x);
        var deltaY = (endPoint.y - origin.y);

        var theta = Math.atan2(deltaY, deltaX);

        var lineLength = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY));

        var straightLineMidPoint = {
          x: lineLength / 2,
          y: 0
        };

        var straightLineAttachmentDeltaX = (attachment.location.offset.left !== undefined ? attachment.location.offset.left : 0) + straightLineMidPoint.x;
        var straightLineAttachmentDeltaY = attachment.location.offset.top !== undefined ? attachment.location.offset.top : 0;

        var straightLineAttachmentLocation = {
          x: straightLineAttachmentDeltaX,
          y: straightLineAttachmentDeltaY
        };

        var straightLineOriginToAttachmentHypoteneuseLength = Math.sqrt((straightLineAttachmentLocation.x * straightLineAttachmentLocation.x) + (straightLineAttachmentLocation.y * straightLineAttachmentLocation.y));

        var straightLineAttachmentTheta = Math.atan2(straightLineAttachmentDeltaY, straightLineAttachmentDeltaX);

        var attachmentTheta = theta + straightLineAttachmentTheta;

        attachment.location.vertex = {
          x: Math.cos(attachmentTheta) * straightLineOriginToAttachmentHypoteneuseLength,
          y: Math.sin(attachmentTheta) * straightLineOriginToAttachmentHypoteneuseLength
        };
      }
    });

    return options;
  }

  function _calculateScaledVertices(vertices, widthScale, heightScale) {
    var oldWidthScale = 1, oldHeightScale = 1;
    if (_currentWidthScale) oldWidthScale = _currentWidthScale;
    if (_currentHeightScale) oldHeightScale = _currentHeightScale;

    var newVertices = [];
    $.each(vertices, function(i, vertex) {
      newVertices[i] = {
        x: (vertex.x / oldWidthScale) * widthScale,
        y: (vertex.y / oldHeightScale) * heightScale
      };
    });

    return newVertices;
  }

  function _makeDraggable(shape) {
    __bindUIActions();

    function __bindUIActions() {
      $(shape).on("childAdded", ___shapeChildAddedHandler);

      if (shape.boundingShape) $(shape.boundingShape).on("selected", ___shapeSelectedHandler);
      else $(shape).on("selected", ___shapeSelectedHandler);
      if (shape.boundingShape) $(shape.boundingShape).on("deselected", ___shapeDeselectedHandler);
      else $(shape).on("deselected", ___shapeDeselectedHandler);

      shape.on("mousedown", ___shapeMouseDownHandler);
      shape.on("pressup", ___shapePressUpHandler);

      function ___shapeChildAddedHandler() {

        //move adjustment handles in sync with shape when shape is moved
        shape.on("pressmove", ____shapePressMoveHandler_children);

        $.each(shape.attachments, function(i, attachment) {
          attachment.on("mousedown", ___shapeMouseDownHandler);
          attachment.on("pressmove", ____shapePressMoveHandler_children);
          attachment.on("pressup", ___shapePressUpHandler);
        });

        function ____shapePressMoveHandler_children(e) {

          var shapesToUpdate = [];
          var noDragX = false;
          var noDragY = false;

          $.each(_shapes, function(i, currentShape) {


            if (_shapeIsSelected(currentShape) && currentShape.shapeOptions.draggable && !currentShape.shapeOptions.locked) {

              //get calculated drag offset
              var offsetX = e.stageX + _dragOffset.x;
              var offsetY = e.stageY + _dragOffset.y;

              //update x values
              if (_enforceBounds === false
                  || ((($canvas.width() > _boundsBuffer + currentShape.getBounds().x + currentShape.getBounds().width + currentShape.x)
                  || (offsetX - currentShape.x < 0))
                  && ((_boundsBuffer < currentShape.getBounds().x + currentShape.x)
                  || (offsetX - currentShape.x > 0)))
              ) {

                shapesToUpdate.push({
                  shape: currentShape,
                  updateValueX: offsetX
                });
                // ____updateShapeLocation(currentShape, "x", offsetX);
              } else {

                var actualX = currentShape.x + currentShape.getBounds().x;
                var actualXPlusWidth = actualX + currentShape.getBounds().width;
                var actualBoundsX = $canvas.width() - _boundsBuffer;

                //if we go too far right
                if (actualXPlusWidth >= actualBoundsX) {

                  shapesToUpdate.push({
                    shape: currentShape,
                    updateValueX: currentShape.x - (actualXPlusWidth - actualBoundsX)
                  });
                  noDragX = true;
                  // ____updateShapeLocation(currentShape, "x", currentShape.x - (actualXPlusWidth - actualBoundsX));

                  //if we go too far left
                } else if (actualX - currentShape.getBounds().width < 0) {

                  shapesToUpdate.push({
                    shape: currentShape,
                    updateValueX: currentShape.x - (actualX - _boundsBuffer)
                  });
                  noDragX = true;
                  // ____updateShapeLocation(currentShape, "x", currentShape.x - (actualX - _boundsBuffer));
                }
              }

              //update y values
              if (_enforceBounds === false
                  || ((($canvas.height() > _boundsBuffer + currentShape.getBounds().y + currentShape.getBounds().height + currentShape.y)
                  || (offsetY - currentShape.y < 0))
                  && ((_boundsBuffer < currentShape.getBounds().y + currentShape.y)
                  || (offsetY - currentShape.y > 0)))
              ) {

                shapesToUpdate.push({
                  shape: currentShape,
                  updateValueY: offsetY
                });
                // ____updateShapeLocation(currentShape, "y", offsetY);
              } else {
                var actualY = currentShape.y + currentShape.getBounds().y;
                var actualYPlusHeight = actualY + currentShape.getBounds().height;
                var actualBoundsY = $canvas.height() - _boundsBuffer;

                //if we go too far down
                if (actualYPlusHeight >= actualBoundsY) {

                  shapesToUpdate.push({
                    shape: currentShape,
                    updateValueY: currentShape.y - (actualYPlusHeight - actualBoundsY)
                  });
                  noDragY = true;
                  // ____updateShapeLocation(currentShape, "y", currentShape.y - (actualYPlusHeight - actualBoundsY));

                  //if we go too far up
                } else if (actualY - currentShape.getBounds().height < 0) {

                  shapesToUpdate.push({
                    shape: currentShape,
                    updateValueY: currentShape.y - (actualY - _boundsBuffer)
                  });
                  noDragY = true;
                  // ____updateShapeLocation(currentShape, "y", currentShape.y - (actualY - _boundsBuffer));
                }
              }
            }

            if (_shapes.length === i + 1) {

              $.each(shapesToUpdate, function(j, shapeToUpdate) {

                if (!noDragX && shapeToUpdate.updateValueX) ____updateShapeLocation(shapeToUpdate.shape, "x", shapeToUpdate.updateValueX);
                if (!noDragY && shapeToUpdate.updateValueY) ____updateShapeLocation(shapeToUpdate.shape, "y", shapeToUpdate.updateValueY);

                //we have reached the end of both of our nested each statements
                if (shapesToUpdate.length === j + 1) {
                  _doUpdate();
                }
              });
            }
          });
        }

        function ____initAttachmentDragOffset(attachment) {
          if (!_attachmentDragOffsets[attachment.name]) {
            _attachmentDragOffsets[attachment.name] = {
              x: attachment.x,
              y: attachment.y
            };
          }
        }

        function ____updateShapeLocation(shape, type, value) {

          //update shape handle locations
          var tempHandles;
          if (shape.boundingBox) tempHandles = shape.boundingBox.handles;
          else tempHandles = shape.handles;

          //update shape x or y location
          shape[type] = value;

          //update bounding box x or y location
          if (shape.boundingBox) shape.boundingBox[type] = value;

          //update handle x or y locations
          $.each(tempHandles, function(o, handle) {
            handle[type] = value;
          });

          //update shape attachment x or y locations
          $.each(shape.attachments, function(j, attachment) {

            //store attachment drag offsets in array if not already stored there
            ____initAttachmentDragOffset(attachment);

            //update current shape attachment x or y location
            attachment[type] = _attachmentDragOffsets[attachment.name][type] + value;
          });
        }
      }

      function ___shapeSelectedHandler() {

        //set isSelected flag
        this.isSelected = true;

        //update cursor of any attachments to signify draggability
        $.each(this.attachments, function(i, attachment) {
          attachment.cursor = "move";
        });

        //determine if we are modifying the shape itself or its bounding box
        var target = this;
        if (this.boundingBox) target = this.boundingBox;

        //update cursor immediately to signify draggability
        target.cursor = "move";

        //also add mouseover listener which updates cursor on mouseover
        target.mouseOverListener_drag = this.on("mouseover", ___shapeMouseOverHandler);
      }

      function ___shapeMouseOverHandler() {
        //update cursor to signify draggability
        this.cursor = "move";
      }

      function ___shapeDeselectedHandler() {
        //clear isSelected flag
        this.isSelected = false;

        //update cursor of any attachments to signify draggability is no longer available
        $.each(this.attachments, function(i, attachment) {
          attachment.cursor = "default";
        });

        //determine if we are modifying the shape itself or its bounding box
        var target = this;
        if (this.boundingBox) target = this.boundingBox;

        //reset cursor to signify draggability is no longer available
        target.cursor = "default";

        //remove the event listener that causes the "move" cursor to appear on mouseover
        target.removeEventListener("mouseover", this.mouseOverListener_drag);
      }

      function ___shapeMouseDownHandler(e) {

        //don't display the marquee square
        _doDrawMarquee = false;

        //calculate and store the drag offset
        if (this.name.indexOf("attachment") > -1 && this.image !== null) {
          _dragOffset = { x: this.parentShape.x - e.stageX, y: this.parentShape.y - e.stageY };
        } else {
          _dragOffset = { x: this.x - e.stageX, y: this.y - e.stageY };
        }

        //turn off html element highlighting while dragging shapes
        _toggleElementHighlighting("off");
      }

      function ___shapePressUpHandler() {

        //clear out temporary attachment drag offset variable
        _attachmentDragOffsets = {};

        //update the location of all selected shape options using the stored mouse offset
        $.each(_shapes, function(i, currentShape) {
          if (_shapeIsSelected(currentShape)) {

            //update shape options location
            currentShape.shapeOptions.x += currentShape.x;
            currentShape.shapeOptions.y += currentShape.y;
          }
        });

        //redraw all shapes to maintain layers
        //then deselect and reselect all currently selected shape to maintain visible bounding box
        _redrawAllAndReSelectCurrentlySelected();

        //turn html element highlighting back on
        _toggleElementHighlighting("on");
      }
    }
  }

  function _makeCurrentlySelected(shape, handlesOverride, addToArray, isGroupSelect) {
    if (typeof shape == "string") {
      $.each(_shapes, function(i, currentShape) {
        if (currentShape.name == shape || currentShape.group == shape) {
          shape = currentShape;

          return false;
        }
      });
    }

    if (addToArray) {
      //add to _currentlySelected array
      if (shape.shapeOptions.selectable) {
        if (shape.shapeOptions.adjustable) _currentlySelected.push(shape.name);
        else _currentlySelected.push("bounding_" + shape.name);
      }
    }

    //add adjustment/resize/selection handles
    _displaySelectionIndicators(shape, handlesOverride);

    //add drag/drop event handlers
    if (shape.shapeOptions.draggable && !shape.shapeOptions.locked) {
      if (shape.boundingBox) _makeDraggable(shape.boundingBox);
      else _makeDraggable(shape);
    }

    //trigger the "selected" event so that other parts of the code can handle the selection if needed
    $(shape).trigger("selected");

    if (addToArray) {
      if (shape.boundingBox) {

        shape.removeAllEventListeners();
        $canvas.trigger("eventListenersRemoved", [shape]);

        shape.boundingBox.on("pressup", __boundingBoxPressUpHandler);
      }
    }

    //if this shape has a group associated and we aren't already in the middle of auto selecting all shapes in this group
    if (!isGroupSelect && shape.group) {

      //loop through each group
      $.each(_shapes, function(i, currentShape) {

        //if the current shape's group is the same as the group of the shape in question
        if (currentShape.group && currentShape.group == shape.group) {

          //and as long as it's not the same shape we've already "madeCurrentlySelected"
          if (currentShape.name != shape.name) {

            //then go ahead and make this one currently selected as well (but specify that this "isGroupSelect" so that we don't loop infinitely)
            _makeCurrentlySelected(currentShape, handlesOverride, addToArray, true);
          }
        }
      });

    }

    function __boundingBoxPressUpHandler() {
      _doDeselectAll = false;
    }
  }

  function _displaySelectionIndicators(shape, handlesOverride) {
    if (shape.shapeOptions.adjustable) {
      //add adjustment handles
      _makeAdjustable(shape, handlesOverride);
    } else if (shape.shapeOptions.resizable) {
      //add resize handles
      _makeResizable(shape, handlesOverride);
    } else {
      //add selection indication handles
      _selectShape(shape);
    }
  }

  function _makeResizable(shape, handlesOverride) {

    //draw the bounding box
    _drawBoundingBox(shape, "resizable", handlesOverride);
  }

  function _selectShape(shape) {
    _drawBoundingBox(shape, "selectable");

    __bindUIActions(shape.boundingBox);

    function __bindUIActions(target) {
      if (target.boundingShape.shapeOptions.locked) target.on("mouseover", ___shapeMouseOverHandler);
      target.on("mousedown", ___shapeMouseDownHandler);

      function ___shapeMouseOverHandler() {
        this.cursor = "not-allowed";
      }

      function ___shapeMouseDownHandler() {
        _doDrawMarquee = false;
      }
    }
  }

  function _deselectShape(shape, reselect) {

    if (shape.isSelected) {

      var tempCurrentlySelected = {};
      $.each(_currentlySelected, function(i, item) {
        if (item == shape.name || item == "bounding_" + shape.name) {
          tempCurrentlySelected.item = item;
          tempCurrentlySelected.itemIndex = i;

          //remove item from _currentlySelected array
          _currentlySelected.splice(i, 1);

          return false;
        }
      });

      //trigger the "deselected" event so that other parts of the code can perform any cleanup items needed
      $(shape).trigger("deselected");

      //remove all the event listeners
      shape.removeAllEventListeners();
      $(shape).off();
      $canvas.trigger("eventListenersRemoved", [shape]);

      //remove adjustment/resize/selection handles
      if (shape.shapeOptions.adjustable) {
        _eraseHandles(shape, true);
      } else if (shape.shapeOptions.resizable || shape.shapeOptions.selectable) {
        _eraseHandles(shape.boundingBox, true);
        _eraseBoundingBox(shape, true);
      }

      //immediately reselect the previously selected item if we need to
      if (reselect) {
        _currentlySelected.splice(tempCurrentlySelected.itemIndex, 0, tempCurrentlySelected.item);
      }

      //add our basic selection event listeners back
      _makeSelectable(shape);
    }
  }

  function _drawBoundingBox(shape, type, handlesOverride) {

    if (handlesOverride) {

      //store the original shape location
      if (!_currentLocationX) {
        _currentLocationX = shape.shapeOptions.x;
        _currentLocationY = shape.shapeOptions.y;
      }

      //update location of shape in addition to the resizing itself
      //doesn't apply when the bottom-right handle is dragged
      shape.shapeOptions.x = _currentLocationX + handlesOverride[0].x;
      shape.shapeOptions.y = _currentLocationY + handlesOverride[0].y;
    }

    //use the shape options to calculate our bounding box vertices
    var boundingBoxVertices = _calculateBounds(shape.shapeOptions.typeSettings.vertices);

    //create the bounding box shape object
    var boundingBox = _createBoundingBox(shape.shapeOptions, boundingBoxVertices);

    //store the bounds info for later easy access
    shape.setBounds(shape.shapeOptions.x, shape.shapeOptions.y, boundingBoxVertices[2].x, boundingBoxVertices[2].y);

    //store a reference to the bounding box inside the shape object
    shape.boundingBox = boundingBox;

    //set parent shape of boundingBox to current shape and add to stage
    _setParentShape(boundingBox, shape, "boundingShape");
    _stage.addChild(boundingBox);

    if (handlesOverride) {
      $.each(handlesOverride, function(i, handle) {
        _setParentShape(boundingBox, handle, "handles");
      });
    } else {
      $.each(boundingBoxVertices, function(i, vertex) {

        //get default handle options for the given shape type (adjustable, resizable, etc)
        var handleOptions = _getHandleOptions(type, shape.shapeOptions, vertex);

        //create handle shape from the handleOptions
        var handle = _createHandle(type, handleOptions, i);

        //set parent shape of current handle to current shape and add to stage
        _setParentShape(boundingBox, handle, "handles");
        _stage.addChild(handle);
      });
    }
  }

  function _calculateBounds(vertices, shape) {

    var lowestX = null,
        lowestY = null,
        highestX = null,
        highestY = null;

    $.each(vertices, function(i, vertex) {

      //calculate highest x and y values so we can store the bounds of the shape
      if (lowestX === null || vertex.x < lowestX) lowestX = vertex.x;
      if (lowestY === null || vertex.y < lowestY) lowestY = vertex.y;
      if (highestX === null || vertex.x > highestX) highestX = vertex.x;
      if (highestY === null || vertex.y > highestY) highestY = vertex.y;

      //if shape is undefined, relative bounds are calculated and returned
      //if shape is provided, actual bounds relative to stage are calculated and saved with shape, but relative bounds are still returned
      if (shape !== undefined) {
        var actualLowestX = lowestX + shape.shapeOptions.x - shape.x;
        var actualHighestX = highestX + shape.shapeOptions.x - shape.x;
        var actualLowestY = lowestY + shape.shapeOptions.y - shape.y;
        var actualHighestY = highestY + shape.shapeOptions.y - shape.y;

        //store the bounds info for later easy access
        shape.setBounds(actualLowestX, actualLowestY, actualHighestX - actualLowestX, actualHighestY - actualLowestY);
      }
    });

    return [
      { x: lowestX, y: lowestY },
      { x: highestX, y: lowestY },
      { x: highestX, y: highestY },
      { x: lowestX, y: highestY }
    ];
  }

  function _createBoundingBox(shapeOptions, boundingBoxVertices) {

    return _drawShape({
      name: "bounding_" + shapeOptions.name,
      x: shapeOptions.x,
      y: shapeOptions.y,
      backgroundColor: 0xCCCCCC,
      borderColor: shapeOptions.locked ? 0x660000 : (shapeOptions.boundingBoxBorderColor ? shapeOptions.boundingBoxBorderColor : 0x000000),
      opacity: 0.1,
      type: "rectangle",
      typeSettings: {
        sideWidth: boundingBoxVertices[2].x,
        sideLength: boundingBoxVertices[2].y
      }
    });
  }

  function _removeAndRedrawAll() {

    //loop through each shape and redraw
    for (var i = 0; i < _shapes.length; i++) {
      _removeAndRedraw(_shapes[0]);
    }
  }

  function _deleteShape(shape, doTrigger, eraseHandles) {

    if (doTrigger === undefined) {
      doTrigger = true;
    }

    if (eraseHandles === undefined) {
      eraseHandles = true;
    }

    //erase shape from stage
    _stage.removeChild(shape);
    //erase handles and bounding box (if applicable)
    if (shape.boundingBox) {

      if (eraseHandles) _eraseHandles(shape.boundingBox);
      _eraseBoundingBox(shape);

    } else {
      if (eraseHandles) _eraseHandles(shape);
    }

    //erase any attachments
    if (shape.attachments) {
      _eraseAttachments(shape);
    }

    // loop through each shape to delete current shape from _shapes array
    $.each(_shapes, function (i, currentShape) {
      if (currentShape.name == shape.name) {
        _shapes.splice(i, 1);

        return false;
      }
    });

    if (doTrigger) $canvas.trigger("shapeDeleted");
  }

  function _deleteSelected() {

    var shapesToDelete = [];
    $.each(_shapes, function(i, currentShape) {
      if (_shapeIsSelected(currentShape) && !currentShape.shapeOptions.locked) {
        shapesToDelete.push(currentShape);
      }

      if (i === _shapes.length - 1) {
        if (shapesToDelete.length > 0) {
          $.each(shapesToDelete, function(o, shapeToDelete) {
            _deleteShape(shapeToDelete, true);

            if (o === shapesToDelete.length - 1) {
              _removeAndRedrawAll();
            }
          });
        }
      }
    });
  }

  function _removeAndRedraw(shape, handlesOverride, newShapeOptions) {

    //NOTE: if handlesOverride is provided, we want to erase the shape but leave the shape handles.
    //This occurs when resizing or adjusting. Among other small benefits, this way of doing things ensures
    //that shape handles are hidden behind the parent shape while resizing/adjusting, assisting accuracy.

    //delete the shape from the stage, shapes array, etc. and remove any attachments, handles, etc.
    _deleteShape(shape, false, !handlesOverride);

    var shapeOptions = shape.shapeOptions;
    if (newShapeOptions !== undefined) shapeOptions = newShapeOptions;

    //redraw our shape and adjustment handles
    _addShape(shapeOptions, handlesOverride);
  }

  function _eraseHandles(shape, removeFromShape) {
    $.each(shape.handles, function(i, handle) {
      _stage.removeChild(handle);
    });

    if (removeFromShape) shape.handles = [];

    _doUpdate();
  }

  function _eraseBoundingBox(shape, removeFromShape) {
    _stage.removeChild(shape.boundingBox);

    if (removeFromShape) delete shape.boundingBox;

    _doUpdate();
  }

  function _eraseAttachments(shape, removeFromShape) {
    $.each(shape.attachments, function (i, attachment) {
      _stage.removeChild(attachment);
    });

    if (removeFromShape) shape.attachments = [];

    _doUpdate();
  }

  function _tick(event) {
    // this set makes it so the stage only re-renders when an event handler indicates a change has happened.
    if (_update) {
      _update = false; // only update once
      _stage.update(event);
    }
  }

  function _stop() {
    //stop the ticker
    createjs.Ticker.removeEventListener("tick", _tick);
  }

  function _dashedLineTo(graphics, x1, y1, x2, y2, dashLen) {
    graphics.moveTo(x1, y1);

    var dX = x2 - x1;
    var dY = y2 - y1;
    var dashes = Math.floor(Math.sqrt(dX * dX + dY * dY) / dashLen);
    var dashX = dX / dashes;
    var dashY = dY / dashes;

    var q = 0;
    while (q++ < dashes) {
      x1 += dashX;
      y1 += dashY;
      graphics[q % 2 === 0 ? 'moveTo' : 'lineTo'](x1, y1);
    }
    graphics[q % 2 === 0 ? 'moveTo' : 'lineTo'](x2, y2);
  }

  function _drawDashedRect(graphics, x1, y1, w, h, dashLen) {
    graphics.moveTo(x1, y1);
    var x2 = x1 + w;
    var y2 = y1 + h;
    _dashedLineTo(graphics, x1, y1, x2, y1, dashLen); // The top line
    _dashedLineTo(graphics, x2, y1, x2, y2, dashLen); // The right line
    _dashedLineTo(graphics, x2, y2, x1, y2, dashLen); // The bottom line
    _dashedLineTo(graphics, x1, y2, x1, y1, dashLen); // The left line
  }

  function _sendToBack() {
    //send layer to back
    _sendLayer("back");
  }

  function _bringToFront() {
    //send layer to front
    _sendLayer("front");
  }

  function _sendLayer(where) {
    var shapesToMove = [],
        shapesToKeep = [];

    //loop through all shapes
    $.each(_shapes, function(i, currentShape) {

      //if current shape is selected, add it to the shapesToMove array
      //otherwise, add it to the shapesToKeep array
      if (_shapeIsSelected(currentShape)) shapesToMove.push(currentShape);
      else shapesToKeep.push(currentShape);
    });

    //reorganize _shapes array
    if (where == "front") _shapes = shapesToKeep.concat(shapesToMove);
    else _shapes = shapesToMove.concat(shapesToKeep);

    //redraw everything with our new _shapes array
    _removeAndRedrawAll();
  }

  function _moveUp() {
    //move layer up
    _moveLayer("up");
  }

  function _moveDown() {
    //move layer down
    _moveLayer("down");
  }

  function _moveLayer(where) {
    var newShapes = [];
    var tempShapes = [].concat(_shapes);

    if (where == "down") tempShapes.reverse();

    //loop through all shapes
    for (var i = tempShapes.length - 1; i >= 0; i--) {

      //if current shape is selected
      if (_shapeIsSelected(tempShapes[i])) {

        //if it's last in array, we can't move it any further up. just pop it and store it to be concatenated later
        //otherwise, go ahead and swap it with the shape above it
        if (i == tempShapes.length - 1) {
          newShapes.push(tempShapes.pop());
        } else {
          var tempShape = tempShapes[i];
          tempShapes[i] = tempShapes[i + 1];
          tempShapes[i + 1] = tempShape;
        }
      }
    }

    //concat any shapes that didn't get moved up
    _shapes = tempShapes.concat(newShapes.reverse());

    if (where == "down") _shapes.reverse();

    //redraw everything with our new _shapes array
    _removeAndRedrawAll();
  }

  function _groupSelected() {

    var shapesToAdd = _getSelectedShapes();

    if (shapesToAdd.length > 0) _addShapesToNewGroup(shapesToAdd);

  }

  function _getSelectedShapes() {

    var selectedShapes = [];
    $.each(_shapes, function(i, currentShape) {
      if (_shapeIsSelected(currentShape)) {
        selectedShapes.push(currentShape);
      }
    });

    return selectedShapes;

  }

  function _ungroupSelected() {
    var didUngroup = false;
    $.each(_shapes, function(i, currentShape) {
      if (_shapeIsSelected(currentShape)) {
        delete currentShape.group;

        didUngroup = true;
      }
    });

    if (didUngroup) $canvas.trigger("groupListUpdated");
  }

  function _lockSelected() {

    $.each(_shapes, function(i, currentShape) {
      if (_shapeIsSelected(currentShape)) {
        currentShape.shapeOptions.locked = true;
      }
    });

    //redraw everything with our new _shapes array
    _removeAndRedrawAll();
  }

  function _unlockSelected() {

    $.each(_shapes, function(i, currentShape) {
      if (_shapeIsSelected(currentShape) && currentShape.shapeOptions.locked) {
        currentShape.shapeOptions.locked = false;
      }
    });

    //redraw everything with our new _shapes array
    _removeAndRedrawAll();
  }

  function _flipHorizontal() {
    $.each(_shapes, function(i, currentShape) {
      if (_shapeIsSelected(currentShape) && !currentShape.shapeOptions.locked) {

        //determine highest x value
        var highestX = 0;
        $.each(currentShape.shapeOptions.typeSettings.vertices, function(o, vertex) {
          if (vertex.x > highestX) highestX = vertex.x;
        });

        $.each(currentShape.shapeOptions.typeSettings.vertices, function(o, vertex) {
          vertex.x = highestX - vertex.x;
        });

        _removeAndRedrawAll();
      }
    });
  }

  function _flipVertical() {
    $.each(_shapes, function(i, currentShape) {
      if (_shapeIsSelected(currentShape) && !currentShape.shapeOptions.locked) {

        //determine highest x value
        var highestY = 0;
        $.each(currentShape.shapeOptions.typeSettings.vertices, function(o, vertex) {
          if (vertex.y > highestY) highestY = vertex.y;
        });

        $.each(currentShape.shapeOptions.typeSettings.vertices, function(o, vertex) {
          vertex.y = highestY - vertex.y;
        });

        _removeAndRedrawAll();
      }
    });
  }

  function _getShapeList() {

    //return _shapes array
    return _shapes === undefined ? [] : _shapes;
  }

  function _getGroupList() {

    var groupList = [],
        groupNameList = [];

    $.each(_shapes, function(i, currentShape) {
      if (currentShape.group) {

        if ($.inArray(currentShape.group, groupNameList) == -1) {
          groupNameList.push(currentShape.group);

          groupList.push({
            name: currentShape.group,
            shapes: [currentShape]
          });
        } else {
          $.each(groupNameList, function(o, currentGroupName) {
            if (currentGroupName == currentShape.group) {
              groupList[o].shapes.push(currentShape);
            }
          });
        }
      }
    });

    return groupList;
  }

  function _doUpdate() {
    _update = true;

    $canvas.trigger("canvasUpdated");
  }

  function _addShapesToNewGroup(shapes, doTrigger) {

    if (doTrigger === undefined) doTrigger = true;

    //determine new group name
    var newGroupName = "group_" + (_getGroupList().length + 1);

    //determine if any of the selected shapes are locked
    var lockAlert = false;
    $.each(shapes, function(i, currentShape) {
      if (currentShape.shapeOptions.locked) lockAlert = true;
    });

    //if any of the selected items are locked, notify the user that grouping them will auto unlock all items
    if (lockAlert && !confirm("One or more items selected are locked. Grouping these items will unlock all items in the group. Are you sure you want to continue?")) {

      //do nothing
    } else {

      //unlock all of the selected items if any are locked
      if (lockAlert) _unlockSelected();

      //update group property for each shape
      $.each(shapes, function(i, currentShape) {
        $.each(_shapes, function(o, currentRealShape) {
          if (currentShape.name == currentRealShape.name) {
            currentRealShape.group = newGroupName;
          }
        });
      });

      //fire groupListUpdated event trigger
      if (doTrigger) $canvas.trigger("groupListUpdated");
    }
  }

  //  function _removeGroup(groupName) {
  //
  //    //iterate each shape in the _shapes array
  //    $.each(_shapes, function(i, currentShape) {
  //
  //      //if the current shape's group matches the specified group to remove, delete the group property from that shape
  //      if (currentShape.group && currentShape.group == groupName) {
  //        delete currentShape.group;
  //      }
  //    });
  //  }

  function _getStage() {
    return _stage;
  }

  return {
    init: _init,
    addShape: _addShape,
    deleteShape: _deleteShape,
    deleteSelected: _deleteSelected,
    sendToBack: _sendToBack,
    bringToFront: _bringToFront,
    moveUp: _moveUp,
    moveDown: _moveDown,
    groupSelected: _groupSelected,
    ungroupSelected: _ungroupSelected,
    lockSelected: _lockSelected,
    unlockSelected: _unlockSelected,
    flipHorizontal: _flipHorizontal,
    flipVertical: _flipVertical,
    getSelectedShapes: _getSelectedShapes,
    getShapeList: _getShapeList,
    getGroupList: _getGroupList,
    makeCurrentlySelected: _makeCurrentlySelected,
    deselectAllShapes: _deselectAllShapes,
    removeAndRedraw: _removeAndRedraw,
    doUpdate: _doUpdate,
    shapeIsSelected: _shapeIsSelected,
    stop: _stop,
    getStage: _getStage
  };
}
