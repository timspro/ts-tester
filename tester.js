/**
 * Provides a way to run and organize unit tests.
 *
 * Thoughts:
 * 1) Maybe prefix/suffix keywords with something to reduce chance of collision?
 * 2) Similary _*_ and circular references could collide.
 * 3) Could use some code comments especially filter().
 * 4) Fix multiple tests besides using wildcard?
 * 5) Range of tests to do #3-4
 */
module.exports = function(filter, fixing) {
  filter = filter || (process && process.env ? process.env.FILTER : false)
  fixing  = fixing  || (process && process.env ? process.env.FIXING : false)
  var fixing_index
  if(fixing) {
    if(!filter) throw 'must specify exact test group (* allowed) to fix via TESTS environment variable'
    if(filter.indexOf(',') >= 0) throw "can't specify multiple test groups when fixing (although * is allowed)"
    if(filter.indexOf('#') >= 0) throw "can't specify a individual test; must do the whole group when fixing"
    fixing = filter.split('.')
    fixing_index = 0
  }
  var $ = {}

  $.quote_pattern = function(delimiter, position) {
    if(delimiter.constructor === Array) delimiter = delimiter.join('|')
    if(typeof position === 'string') position = parseInt(position)
    if(!position) position = 1
    var group = '\\' + position
    //This matches anything that starts with a delimiter and then looks for \ and any character (i.e.
    //to match \n, \t, \", \', \\, etc.) OR anything that is not the delimiter or the backslash.
    //If the latter case instead consumed the backslash, then \" would incorrectly trigger the end.
    //This implies that the last character of a quote can't be a backslash unless the second to last
    //is one as well. Also, note that there are only two capturing groups in the returned expression:
    //the first one matches the quote delimiter and the second matches the quote content.
    return '(?:(' + delimiter + ')((?:\\\\.|(?:(?!' + group + '|\\\\).))*)' + group + ')'
  }

  $.sanitize = function(content, callback) { //quote_replacer???
    var input = '', regex = new RegExp($.quote_pattern(['`', '"', "'"]), 'g')
    var result, start = 0, count = 0, quotes = []
    do {
      result = regex.exec(content)
      if(!result) {
        input += content.substring(start)
        break
      } else if(result.index !== start){
        input += content.substring(start, result.index)
        start = result.index
      }
      quotes.push(result[0])
      var next = "'!_!_#" + count + "#_!_!'"
      count++
      input += next
      start += result[0].length
    } while(result)

    var output = callback(input)
    var index = 0
    for(var i = 0; i < quotes.length; i++) {
      var quote = quotes[i], search = "'!_!_#" + i + "#_!_!'"
      index = output.indexOf(search, index)
      if(index >= 0) {
        output = output.substring(0, index) + quote + output.substring(index + search.length)
        index += quote.length
      }
    }

    return output
  }

  try {
    var util = require('util')
    if(!util) throw 'fallback to other way to inspect'
    $.inspect = function(first, depth, indent, length) {
      indent = indent || ''
      var output = util.inspect(first, {
        depth: depth || null,
        maxArrayLength: typeof length !== 'undefined' ? length : 0
      })
      output = $.sanitize(output, function(token) {
        token = token.replace(/{ /g, '{').replace(/ }/g, '}')
        token = token.replace(/\[ /g, '[').replace(/ ]/g, ']')
        return token.replace(/\n/g, '\n' + indent)
      })//, function(token) { return token === "'$'" ? '$' : token })
      //if(output.length >= 50) return '\n ' + output + '\n'
      return output
    } //breakLength: 0
  } catch(e) {
    //won't be able to print circular references; seems okay for now since not focused on browser
    $.inspect = function(first) { return JSON.stringify(first) }
  }

  $.keywords = {test: 1, input: 1, output: 1, select: 1}

  $.error = function(actual, expected) {
    throw 'actual ' + (typeof actual === 'function' ? 'function' : $.inspect(actual)) +
      ' does not match expected ' + (typeof expected === 'function' ? 'function' : $.inspect(expected))
  }

  $.ordinal = function(number) {
    if(number % 10 === 1 && number % 100 !== 11)
      return number + 'st'
    else if(number % 10 === 2 && number % 100 !== 12)
      return number + 'nd'
    else if(number % 10 === 3 && number % 100 !== 13)
      return number + 'rd'
    return number + 'th'
  }

  $.assert = function(actual, expected, top) {
    if(!top) top = actual
    if(expected === '_*_') return true
    else if(typeof expected === 'string' && expected[0] === '_' && expected[expected.length - 1] === '_') {
      var query = expected.substring(1, expected.length - 1), parts = query.split('.'), queried = top
      if(parts[0] === '$') parts.shift()
      for(var i = 0; i < parts.length; i++) {
        if(typeof queried[parts[i]] === 'undefined') throw "path '" + query + "' not found in " + $.inspect(queried, 1)
        queried = queried[parts[i]]
      }
      if(queried !== actual)
        throw "path '" + query + "' resolved to " + $.inspect(queried, 1) + ' instead of ' + $.inspect(actual, 1)
      return true
    }

    if(actual !== null && typeof actual === 'object' && expected !== null && typeof expected === 'object') {
      //compares arrays and objects
      for(var key in expected)
        try {
          $.assert(actual[key], expected[key], top)
        } catch(e) {
          if(typeof e === 'string' && e.substring(0, 4) === 'path') throw e
          else throw e + " for '" + key + "' in " + $.inspect(actual, 1)
        }
      for(var key in actual) {
        if(typeof expected[key] === 'undefined') {
          if(top !== actual) throw "key '" + key + "' in actual does not exist in expected"
          else throw "key '" + key + "' does not exist in expected but is in actual which is " + $.inspect(actual, 1)
        }
      }
    } else if(actual !== expected) $.error(actual, expected)

    return true
  }

  $.filter = function(tests) {
    if(!filter) return
    var forbidden = {}
    for(var keyword in $.keywords) forbidden[keyword] = true

    //check if first token is '!'; if so show everything, if not hide everything
    //for '!', hide last part of rule and children, ignoring other parts
    //otherwise, show each part of the rule and children
    //could maybe allow hidden to be a child of shown? but parent test could still run?

    function make(tests, show) {
      var result = {}
      for(var key in tests) {
        if(typeof forbidden[key] === 'undefined') {
          result[key] = [show, make(tests[key], show)]
        }
      }
      return result
    }
    var selectors = filter.split(','), record = make(tests, selectors[0][0] === '!')
    function spread(record, show) {
      for(var key in record) {
        record[key][0] = show
        spread(record[key][1], show)
      }
    }
    function recurse(index, parts, record, show) {
      if(index >= parts.length) {
        spread(record, show)
        return
      }
      var subparts = parts[index] === '*' ? Object.keys(record) : parts[index].split('/')
      for(var i = 0; i < subparts.length; i++) {
        var subpart = subparts[i], match = subpart.match(/#([0-9-]+)$/)
        if(match !== null) subpart = subpart.substring(0, match.index)
        if(typeof record[subpart] === 'undefined')
          throw "Requested test '" + parts.join('.') + "' not found using '" + subpart + "'"
        if(show) record[subpart][0] = true
        else if(index === parts.length - 1) record[subpart][0] = false
        if(match !== null) record[subpart].push(match[1])
        recurse(index + 1, parts, record[subpart][1], show)
      }
    }
    for(var i = 0; i < selectors.length; i++) {
      var selector = selectors[i].trim(), show
      if(selector[0] === '!') {
        selector = selector.substring(1)
        show = false
      } else show = true
      recurse(0, selector.split('.'), record, show)
    }

    function keep(record, tests) {
      for(var key in record)
        if(!record[key][0]) delete tests[key]
        else {
          if(record[key].length === 3) {
            var select = tests[key].select = record[key][2].split('-')
            select[0] = parseInt(select[0])
            select[1] = select[1] ? parseInt(select[1]) : select[0]
          }
          keep(record[key][1], tests[key])
        }
    }
    keep(record, tests)
  }

  try {
    var fs = require('fs'), newer_content
    $.fix = function(result, path) {
      var filename = process.argv[1]
      fs.readFile(filename, function(error, content) {
        if(error) throw error
        //avoid file synchronization by always making sure we have the newest content
        if(newer_content) content = newer_content
        //guess at tab
        var tab = (new RegExp('^(?: +|\t+)', 'gm').exec(content)) || '  '
        //on a version of the souce with quotes replaced, try to find the right key...
        var output = $.sanitize(content.toString(), function(content) {
          //find start
          var regex = new RegExp('^([ \t]*)testing.run\\(', 'gm')
          var found = regex.exec(content)
          if(!found) throw "couldn't find 'testing.run('"
          var head_start = regex.lastIndex, indent = found[1]
          //find each key
          for(var i = 0; i < path.length; i++) {
            regex = new RegExp('^(' + indent + tab + ')' + path[i] + ':([\\s\n]*{[\\s\n]*})?|'
                + '^(' + indent + '})', 'gm')
            //start search at right spot
            if(head_start) regex.lastIndex = head_start
            found = regex.exec(content)
            //if we didn't find anything or found the closing bracket...
            if(!found || found[3]) throw "couldn't fix tests; no '" + path[i] + "' key found from " + path.join('.')
            //change indent
            indent = found[1]
            if(found[2]) {
              //if we found an empty object, insert "output: []"
              head_start = found.index + found[0].lastIndexOf('{') + 1
              content = content.substring(0, head_start) + '\n' + indent + tab + 'output: []\n'
                + indent + '}' + content.substring(found.index + found[0].length)
            } else head_start = regex.lastIndex
          } //[ \t\\]]*
          regex = new RegExp('^(' + indent + tab + ')output:(?:[\\s\\S]+?\\1\\](?:.*\\])?|\\s*\\[.*\\])|'
            + '^(' + indent + '})', 'gm') //still can affect comments which should probably be removed like quotes
            //start search at right spot
          if(head_start) regex.lastIndex = head_start
          var found = regex.exec(content)
            //if we didn't find anything or found the closing bracket...
          if(!found || found[2]) throw "couldn't fix tests; no 'output' key in " + path.join('.')
          indent = found[1]
          //format the output array
          var final = $.inspect(result, null, indent, null)
          //remove enclosing square brackets
          final = final.substring(final.indexOf('[') + 1, final.lastIndexOf(']'))
          if(!final.length) throw 'empty test results for fix; aborting'
          //write output array
          content = content.substring(0, found.index) + indent +
            'output: [\n' + indent + tab + final +
            '\n' + indent + ']' + content.substring(found.index + found[0].length)
          return content
        })
        newer_content = output
        fs.writeFileSync(filename, output)
      })
    }
  } catch(e) {
    $.fix = function() { throw 'need file system to attempt to fix tests' }
  }

  var info, group_count, test_count
  $.run = function(test, inherited, name, path, child) {
    if(!child) {
      inherited = {}, info = {}, group_count = 0, test_count = 0, path = []
      if(typeof test === 'function') test = test(info)
      $.filter(test)
    }
    try {
      var now = true, options = {}
      if(fixing && fixing.length === fixing_index && !test.output) test.output = []
      for(var keyword in $.keywords) {
        if(typeof test[keyword] === 'undefined' && test.hasOwnProperty(keyword))
          throw 'option "' + keyword + '" is set to "undefined"'
        options[keyword] = test[keyword] || inherited[keyword]
        if(typeof options[keyword] === 'undefined' && keyword !== 'select') now = false
      }
      if(now) {
        var i, j
        try {
          if(options.input.constructor !== Array) throw 'input must be an array'
          var select = options.select, results = []
          group_count++
          info.options = options, info.name = name, info.path = path //side effect
          for(i = 0; i < options.input.length; i++) {
            if(typeof select !== 'undefined' && (i + 1 < select[0] || select[1] < i + 1)) continue
            test_count++
            info.index = i; j = false
            var input = options.input[i], output = options.output[i]
            var result = options.test.apply(null, input.constructor !== Array ? [input] : input)
            if(typeof result === 'function') {
              if(!fixing && (!output || output.constructor !== Array))
                throw "can't use a generator unless each output is an array"
              var generated; j = 0
              if(fixing) results.push([])
              while(typeof (generated = result(j)) !== 'undefined') {
                if(fixing) results[results.length - 1].push(generated)
                else $.assert(generated, output[j])
                j++ 
              }
              if(!fixing && j !== output.length) 
                throw "generator returned 'undefined' before " + $.ordinal(output.length + 1) + " yield was checked"
            } else {
              if(fixing) results.push(result)
              else $.assert(result, output)
            }
          }
          if(fixing) $.fix(results, path)
        } catch(e) {
          if((typeof e === 'string' && !(test.output instanceof Error)) ||
              (typeof e !== 'string' && e.constructor !== test.output.constructor)) {
            var message = typeof e === 'string' ? e : e.message, yielded = ''
            if(typeof j === 'number') yielded = ' ' + $.ordinal(j + 1) + ' yield'
            var error = new Error('on ' + $.ordinal(i + 1) + ' test' + yielded + ': ' + message)
            error.stack = e.stack
            error.name = e.name
            throw error
          }
        }
      } else {
        for(var next in test) {
          if($.keywords[next] || typeof test[next] !== 'object') continue
          if(fixing && fixing[fixing_index] !== next && fixing[fixing_index] !== '*')
            throw 'must specify exact test group to fix, not a parent; * allowed'
          else fixing_index++
          $.run(test[next], options, next, path.concat([next]), true)
          if(fixing && fixing[fixing_index - 1] === '*') fixing_index--
        }
      }
    } catch(e) {
      var message = typeof e === 'string' ? e : e.message
      if(!child) {
        if(typeof e.stack !== 'undefined')
          message += "\n" + e.stack.substring(e.stack.indexOf('\n') + 1)
        console.log((e.name ? e.name : 'failure') + ': ' + message)
      } else {
        //Propagate error information with some extra information about what test was being run.
        var error = new Error('on \'' + name + '\' test: ' + message)
        error.stack = e.stack
        error.name = e.name
        throw error
      }
    }
    if(!child) {
      console.log('Ran ' + group_count + ' test group' + (group_count === 1 ? '' : 's') +
      ' and ' + test_count + ' test' + (test_count === 1 ? '' : 's') + '.')
      info = {}
    }
  }

  return $
}