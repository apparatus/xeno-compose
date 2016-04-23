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
     var templateArgs = {
       yamlPath: yamlPath,
       source: JSON.stringify(cdef, null, 2),
       containerName: name,
       execute: command,
       build: buildScript,
       path: '',
       servicePort: '\'auto\'',
       proxyPort: '\'auto\''
     };

     var dir;
     var env = {};
     var result;

     if (cdef.environment) {
       if (_.isArray(cdef.environment)) {
         _.each(cdef.environment, function(el) {
           var s = el.split('=');
           env[s[0]] = s[1];
         });
       }
       else {
         _.each(_.keys(cdef.environment), function(key) {
           env[key] = cdef.environment[key];
         });
       }
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

      if (cdef.container_name) {
        dockerCommand += '--name ' + cdef.container_name;
      }

      if (cdef.ports) {
        _.each(cdef.ports, function(el) {
          var s = el.split(':');
          env[s[0]] = s[1];
          dockerCommand += ' -p ' + el;
        });
      }

      if (cdef.volumes) {
        _.each(cdef.volumes, function(el) {
          var v = el.split(':');
          if ((v.length > 1) && isRelative(v[0])) {
            v[0] = path.resolve(path.dirname(yamlPath), v[0]);
          }
          dockerCommand += ' -v ' + v.join(':');
        });
      }

      if (cdef.volumes_from) {
        _.each(cdef.volumes_from, function(el) {
          dockerCommand += ' --volumes-from ' + el;
        });
      }

      if (env) {
        _.each(_.keys(env), function(key) {
          dockerCommand += ' -e ' + key + '=' + env[key];
        });
      }
      dockerCommand += ' ' + cdef.image;

      if (cdef.command) {
        dockerCommand += ' ' + cdef.command;
      }

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



  var excludeKey = function(key) {
    var excludedKeys = ['cpu_shares', 
                        'cpu_quota',
                        'cpuset',
                        'user',
                        'working_dir',
                        'domainname',
                        'hostname',
                        'ipc',
                        'mac_address',
                        'mem_limit',
                        'memswap_limit',
                        'privileged',
                        'restart',
                        'read_only',
                        'stdin_open',
                        'tty',
                        'env_file'];
    return _.find(excludedKeys, function(exKey) { return exKey === key; });
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
      if (!excludeKey(key)) {
        command = readCommandFromDockerfile(doc[key], yamlPath);
        buildScript = 'echo NO BUILD SCRIPT!';
        containers += generateContainer(key, command, buildScript, yamlPath, doc[key]);
        containerNameList.push(key);
      }
    });
    systemDef = generateSystem({name: name, id: id, env: env, path: path.dirname(yamlPath), containerList: JSON.stringify(containerNameList)});

    cb(null, {systemDef: systemDef, containers: containers});
  };


  return {
    translate: translate,
  };
};
 

function isRelative(fn) {
  return /^\.\.?\//.test(fn);
}
