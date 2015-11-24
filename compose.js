/*
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESSED OR IMPLIED
 * WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED.  IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING
 * IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var yaml = require('js-yaml');


module.exports = function() {

   var generateSystem = function(templateArgs) {
     var templateString = fs.readFileSync(__dirname + '/templates/system.js.tmpl');
     var template = _.template(templateString);
     return template(templateArgs);
   };



   var generateContainer = function(name, command, buildScript, yamlPath, cdef) {
     var templateString = fs.readFileSync(__dirname + '/templates/definition.js.tmpl');
     var dockerTemplateString = fs.readFileSync(__dirname + '/templates/docker.js.tmpl');
     var template = _.template(templateString);
     var dockerTemplate = _.template(dockerTemplateString);
     var servicePorts = [];
     var proxyPorts = [];
     var templateArgs = {containerName: name,
                         execute: command,
                         build: buildScript,
                         path: '',
                         servicePort: '\'auto\'',
                         proxyPort: '\'auto\''};
     var dir;
     var env = {};
     var result;

     if (cdef.environment) {
       _.each(cdef.environment, function(el) {
         var s = el.split('=');
         env[s[0]] = s[1];
       });
       templateArgs.environment = JSON.stringify(env, null, 2);
     }
     else {
       templateArgs.environment = '[]';
     }

    if (cdef.build) {
      dir = path.dirname(yamlPath);
      dir += '/' + cdef.build;
      templateArgs.path = dir;
    }

    if (cdef.command) {
     templateArgs.command = cdef.command;
    }

    if (cdef.ports) {
      _.each(cdef.ports, function(el) {
        var s = el.split(':');
        if (s.length > 1) {
          servicePorts.push(s[1]);
        }
        else {
          servicePorts.push('\'auto\'');
        }
        proxyPorts.push(s[0]);
      });
      templateArgs.servicePort = servicePorts;
      templateArgs.proxyPort = proxyPorts;
    }

    if (cdef.image) {
      var dockerCommand = 'docker run ';
      if (cdef.ports) {
        _.each(cdef.ports, function(el) {
          var s = el.split(':');
          env[s[0]] = s[1];
          dockerCommand += ' -p ' + el;
        });
      }
      dockerCommand += ' ' + cdef.image;
      templateArgs.execute = dockerCommand;
      templateArgs.image = cdef.image;
      result = dockerTemplate(templateArgs);
    }
    else {
      result = template(templateArgs);
    }
    return result;
  };



  var interpretArrayCommand = function(cmdArrStr) {
    cmdArrStr = cmdArrStr.replace(/^\s+|\s+$/g, '');
    cmdArrStr = cmdArrStr.replace(/^\[|\]$/g, '');
    cmdArrStr = cmdArrStr.replace(/"|']$/g, '');
    return cmdArrStr.split(',').join(' ');
  };



  var interpolateBuildScriptFromDockerfile = function(cdef, yamlPath) {
    var dir;
    var docker;
    var lines;
    var match;
    var script = 'echo NO BUILD SCRIPT!';
    var re = /RUN (.*)/g;

    if (cdef.build) {
      dir = path.dirname(yamlPath);
      dir += '/' + cdef.build;
      try {
        if (fs.existsSync(dir + '/Dockerfile', 'utf8')) {
          docker = fs.readFileSync(dir + '/Dockerfile', 'utf8');
          lines = docker.split('\n');
          if (lines.length > 0) { script = ''; }
          _.each(lines, function(line) {
            if (null !== (match = re.exec(line))) {
              script += match[1] + '; ';
            }
          });
        }
      }
      catch (e) {
      }
    }
    return script;
  };



  var readCommandFromDockerfile = function(cdef, yamlPath) {
    var dir;
    var docker;
    var lines;
    var match;
    var command = '';
    var re = /^CMD (.*)/g;

    if (cdef.build) {
      dir = path.dirname(yamlPath);
      dir += '/' + cdef.build;
      try {
        if (fs.existsSync(dir + '/Dockerfile', 'utf8')) {
          docker = fs.readFileSync(dir + '/Dockerfile', 'utf8');
          lines = docker.split('\n');
          _.each(lines, function(line) {
            if (null !== (match = re.exec(line))) {
              command = match[1];
              if (command.indexOf('[') !== -1) {
                command = interpretArrayCommand(command);
              }
            }
          });
        }
      }
      catch (e) {
      }
    }
    return command;
  };



  /**
   * translates from docker-compose syntax to nscale syntax.
   */
  var translate = function(name, id, env,  yamlPath, cb) {
    var doc;
    var command;
    var buildScript;
    var systemDef = '';
    var containers = '';
    var containerNameList = [];

    try {
      doc = yaml.safeLoad(fs.readFileSync(yamlPath, 'utf8'));
    } 
    catch (err) {
      return cb(err);
    }

    containers = fs.readFileSync(__dirname + '/templates/root.js.tmpl');
    _.each(_.keys(doc), function(key) {
      command = readCommandFromDockerfile(doc[key], yamlPath);
      buildScript = interpolateBuildScriptFromDockerfile(doc[key], yamlPath);
      containers += generateContainer(key, command, buildScript, yamlPath, doc[key]);
      containerNameList.push(key);
    });
    systemDef = generateSystem({name: name, id: id, env: env, path: path.dirname(yamlPath), containerList: JSON.stringify(containerNameList)});

    cb(null, {systemDef: systemDef, containers: containers});
  };


  return {
    translate: translate,
  };
};
 

