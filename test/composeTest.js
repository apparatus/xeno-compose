/* jshint evil: true */
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

var test = require('tape');
var compose = require('../compose')();

test('compose test', function(t) {
  t.plan(3);

  compose.translate('test', '12345', 'dev', __dirname + '/system1/compose.yml', function(err, system) {
    t.equal(err, null);
    eval(system.systemDef);
    t.equal(exports.topology.dev.root[1], 'redis');
    t.equal(1, 1);
  });
});


test('bad yaml test', function(t) {
  t.plan(2);

  compose.translate('test', '12345', 'dev', __dirname + '/system1/fish.yml', function(err, system) {
    t.notEqual(err, null);
    t.equal(system, undefined);
  });
});


