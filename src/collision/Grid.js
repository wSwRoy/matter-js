var Grid = {};

(function() {

    Grid.create = function(bucketWidth, bucketHeight) {
        return {
            buckets: {},
            pairs: {},
            pairsList: [],
            bucketWidth: bucketWidth || 48,
            bucketHeight: bucketHeight || 48
        };
    };

    Grid.update = function(grid, bodies, engine, forceUpdate) {
        var i, col, row,
            world = engine.world,
            buckets = grid.buckets,
            bucket,
            bucketId,
            metrics = engine.metrics,
            gridChanged = false;

        metrics.broadphaseTests = 0;

        for (i = 0; i < bodies.length; i++) {
            var body = bodies[i];

            if (body.isSleeping)
                continue;

            // don't update out of world bodies
            if (body.bounds.max.x < 0 || body.bounds.min.x > world.bounds.width
                || body.bounds.max.y < 0 || body.bounds.min.y > world.bounds.height)
                continue;

            var newRegion = _getRegion(grid, body);

            // if the body has changed grid region
            if (!body.region || newRegion.id !== body.region.id || forceUpdate) {

                metrics.broadphaseTests += 1;

                if (!body.region || forceUpdate)
                    body.region = newRegion;

                var union = _regionUnion(newRegion, body.region);

                // update grid buckets affected by region change
                // iterate over the union of both regions
                for (col = union.startCol; col <= union.endCol; col++) {
                    for (row = union.startRow; row <= union.endRow; row++) {
                        bucketId = _getBucketId(col, row);
                        bucket = buckets[bucketId];

                        var isInsideNewRegion = (col >= newRegion.startCol && col <= newRegion.endCol
                                                && row >= newRegion.startRow && row <= newRegion.endRow);

                        var isInsideOldRegion = (col >= body.region.startCol && col <= body.region.endCol
                                                && row >= body.region.startRow && row <= body.region.endRow);

                        // remove from old region buckets
                        if (!isInsideNewRegion && isInsideOldRegion) {
                            if (isInsideOldRegion) {
                                if (bucket)
                                    _bucketRemoveBody(grid, bucket, body);
                            }
                        }

                        // add to new region buckets
                        if (body.region === newRegion || (isInsideNewRegion && !isInsideOldRegion) || forceUpdate) {
                            if (!bucket)
                                bucket = _createBucket(buckets, bucketId);
                            _bucketAddBody(grid, bucket, body);
                        }
                    }
                }

                // set the new region
                body.region = newRegion;

                // flag changes so we can update pairs
                gridChanged = true;
            }
        }

        // update pairs list only if pairs changed (i.e. a body changed region)
        if (gridChanged)
            grid.pairsList = _createActivePairsList(grid);
    };

    Grid.clear = function(grid) {
        grid.buckets = {};
        grid.pairs = {};
        grid.pairsList = [];
    };

    var _regionUnion = function(regionA, regionB) {
        var startCol = Math.min(regionA.startCol, regionB.startCol),
            endCol = Math.max(regionA.endCol, regionB.endCol),
            startRow = Math.min(regionA.startRow, regionB.startRow),
            endRow = Math.max(regionA.endRow, regionB.endRow);

        return _createRegion(startCol, endCol, startRow, endRow);
    };

    var _getRegion = function(grid, body) {
        var bounds = body.bounds,
            startCol = Math.floor(bounds.min.x / grid.bucketWidth),
            endCol = Math.floor(bounds.max.x / grid.bucketWidth),
            startRow = Math.floor(bounds.min.y / grid.bucketHeight),
            endRow = Math.floor(bounds.max.y / grid.bucketHeight);

        return _createRegion(startCol, endCol, startRow, endRow);
    };

    var _createRegion = function(startCol, endCol, startRow, endRow) {
        return { 
            id: startCol + ',' + endCol + ',' + startRow + ',' + endRow,
            startCol: startCol, 
            endCol: endCol, 
            startRow: startRow, 
            endRow: endRow 
        };
    };

    var _getBucketId = function(column, row) {
        return column + ',' + row;
    };

    var _createBucket = function(buckets, bucketId) {
        var bucket = buckets[bucketId] = [];
        return bucket;
    };

    var _bucketAddBody = function(grid, bucket, body) {
        // add new pairs
        for (var i = 0; i < bucket.length; i++) {
            var bodyB = bucket[i];

            if (body.id === bodyB.id || (body.isStatic && bodyB.isStatic))
                continue;

            // keep track of the number of buckets the pair exists in
            // important for Grid.update to work
            var pairId = _getPairId(body, bodyB);
            if (grid.pairs[pairId]) {
                grid.pairs[pairId][2] += 1;
            } else {
                grid.pairs[pairId] = [body, bodyB, 1];
            }
        }

        // add to bodies (after pairs, otherwise pairs with self)
        bucket.push(body);
    };

    var _bucketRemoveBody = function(grid, bucket, body) {
        // remove from bodies
        for (var i = 0; i < bucket.length; i++) {
            var bodyB = bucket[i];

            // when position of body in bucket array is found, remove it
            if (bodyB.id === body.id) {
                bucket.splice(i, 1);
                continue;
            } else {
                // keep track of the number of buckets the pair exists in
                // important for Grid.update to work
                var pairId = _getPairId(body, bodyB);
                if (grid.pairs[pairId]) {
                    var pairCount = grid.pairs[pairId][2];
                    grid.pairs[pairId][2] = pairCount > 0 ? pairCount - 1 : 0;
                }
            }
        }
    };

    var _getPairId = function(bodyA, bodyB) {
        if (bodyA.id < bodyB.id) {
            return bodyA.id + ',' + bodyB.id;
        } else {
            return bodyB.id + ',' + bodyA.id;
        }
    };

    var _createActivePairsList = function(grid) {
        var pairKeys,
            pair,
            pairs = [];

        // grid.pairs is used as a hashmap
        pairKeys = Common.keys(grid.pairs);

        // iterate over grid.pairs
        for (var k = 0; k < pairKeys.length; k++) {
            pair = grid.pairs[pairKeys[k]];

            // if pair exists in at least one bucket
            // it is a pair that needs further collision testing so push it
            if (pair[2] > 0)
                pairs.push(pair);
        }

        return pairs;
    };
    
})();