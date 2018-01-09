This is a testing library.

## Running the tester

to install:

`npm install ts-tester`

sample test file: 

```
let tester = require('ts-tester')
let filter = <string>, fixing = <boolean>
let testing = tester(filter, fixing)
let input = <array>, output = <array>, test = <function> 
testing.run({
  input,
  output,
  test
})
```

OR more commonly (since filter and fixing are usually provided via command line if at all):

```
let testing = require('ts-tester')()
testing.run({
  input: [...],
  output: [...],
  test: (param1, param2, ...) => {
    //do something
    ...
  }
})
```

Put either one of the above into a file that can be named whatever you want although be sure
to add code where there is <> or ... . Then you can run the file by calling node directly
on the file i.e. `node tests.js` or `FILTER=... tests.js` or `FIXING=1 FILTER=... tests.js`.

what it do:

In the above example, the input array represents a series of inputs that individually will be provided as an
array of arguments to the test function also provided. These will then be checked against the output provided
to see if they are same. If not then an error will be shown in the console. For example,

```
testing.run({
  group1: {
    input: ['1', '2', '3'],
    output: [1, 2, 3],
    test: parseInt
  }
})
```

is a valid test that will pass. However,

```
testing.run({
  group1: {
    input: ['1', '2', '3'],
    output: ['blah', 'red', 'blue'],
    test: parseInt
  }
})
```

will not. Elsewhere in the documentation the object that is set to group1 is called the test object.

Tests can also be nested and child test groups will inherit the defined keywords in the parent tests. For example,

```
testing.run({
  group1: {
    input: ['1', '2', '3'],
    test: parseInt,
    good: {
      output: [1, 2, 3],
    },
    bad: {
      output: ['blah', 'red', 'blue'],
    }
  }
})
```

"group1.good" will pass and "group1.bad" will not.

Above filters and fixing are two parameters to and indiviual set of tests contained within a file. Both of these 
parameters can also be passed as environment variables and will be used only if the corresponding parameter is
falsy. The environment variables are named 'FILTER' and 'FIXING'. 

`filter` is a string declaring what tests to run. Examples are: 'group1' to run a test group called
"group1"; 'group1.subgroup1' to run a subgroup of a test group called "subgroup1", 'group1#3' to run the third
test in a group called "group1", 'group2#-1' to run the last test in a test group called "group2", 
'group1,group2' to run test groups "group1" and "group2", and 'group2#3-5' to run the third through fifth tests
of test group "group2".

`fixing` if truthy attempts to automatically write the output of running a test with the given inputs into the
test file. Make sure you backup your code before running this. Only the run file is affected. If you did
node * in your tests directory, then do to shell expansion it would attempt to rewrite all test output.

For this to work correctly, you need to indent the line one indentation below the line where the test object
is defined. For example,

```
testing.run({
  group1: {
    input: ['1', '2', '3'],
    output: [],
    test: parseInt
  }
})
```

works but the following is bad:

```
testing.run({
  group1: {
  input: ['1', '2', '3'],
  output: [],
  test: parseInt
  }
})
```

NOTE THAT YOU SHOULDNT MIX TAB AND SPACES WHEN USING THIS!