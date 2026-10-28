import {generateC,configuration} from './exports.js?v=airframes-1';
import {zipStore} from './zip.js';

export function customBoard(input){
  const name=String(input.name||'').trim(),fqbn=String(input.fqbn||'').trim();
  if(!name||name.length>80||/[\x00-\x1f]/.test(name))throw Error('Nom de carte invalide.');
  if(!/^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+(?::[A-Za-z0-9_.-]+=[A-Za-z0-9_.-]+(?:,[A-Za-z0-9_.-]+=[A-Za-z0-9_.-]+)*)?$/.test(fqbn))throw Error('Identifiant FQBN invalide. Exemple : arduino:renesas_uno:minima');
  return {id:'custom',name,fqbn,core:fqbn.split(':').slice(0,2).join(':'),group:'Profil personnalisé',architecture:'À vérifier',flash:null,ram:null,limited:!!input.limited,imu:'À définir',source:'',indexUrl:'',validation:null,notes:'Profil fourni par l’utilisateur ; architecture, mémoire, brochage et cadence non vérifiés.'};
}
function validateBoard(board){if(!board||!board.id||!board.fqbn)throw Error('Choisis une carte.');customBoard(board);return board;}

const HAL=`#pragma once
#include <Arduino.h>
#include "dl_controller.h"
/* Adapter hooks: replace only after identifying, calibrating and validating
 * the actual sensors, estimator, receiver, ESC mapping and board pinout.
 * All coordinates MUST be local ENU/FLU, SI units, Hamilton body->world q.
 * Never replace a missing sensor with simulated measurements on a real drone.
 */
static inline bool dl_hw_begin() { return false; }
static inline bool dl_hw_ready() { return false; }
static inline bool dl_hw_armed() { return false; }
/* Must return one coherent, finite ESTIMATED state and acquisition timestamp.
 * now_us and sample_us use the same 32-bit micros() clock (wrap supported).
 */
static inline bool dl_hw_read_state(DL_State *state, uint32_t *sample_us) {
  (void)state; (void)sample_us; return false;
}
/* Real mission / pilot / supervisor target; no real takeoff is preprogrammed. */
static inline bool dl_hw_read_target(DL_Target *target) {
  (void)target; return false;
}
/* Implement a board-specific, calibrated thrust->ESC driver. Newtons != PWM.
 * Must provide its own independent timeout/kill path; not analogWrite().
 */
static inline void dl_hw_write_motor_newtons(const double motor_N[DL_MAX_MOTORS], unsigned motor_count) {
  (void)motor_N; (void)motor_count;
}
`;

const SKETCH=`/* DroneLab Arduino PORTING / BENCH project. Not a flight firmware.
 * Serial monitor 115200: i = status, b = controller-only benchmark (disarmed),
 * r = reset faults (disarmed). No serial command arms the board.
 * Motor outputs are disabled in dl_board.h AND all hardware hooks are stubs.
 */
#include <Arduino.h>
#include "dl_board.h"
#include "dl_hal.h"

static DL_Controller controller;
static DL_Output output;
static uint32_t last_tick=0, max_compute_us=0, deadline_misses=0;
static bool integration_started=false, fault_latched=false;

static void stop_outputs() {
  for (unsigned i=0;i<DL_MAX_MOTORS;i++) output.motor_N[i]=0;
#if DL_ACTUATORS_ENABLED && !DL_LIMITED_PROFILE
  dl_hw_write_motor_newtons(output.motor_N, DL_MOTOR_COUNT);
#endif
  dl_reset(&controller);
}
static void show_status() {
  Serial.println(DL_BOARD_NAME);
  Serial.print("Airframe: "); Serial.println(DL_AIRFRAME_NAME);
  Serial.print("Motors: "); Serial.println(DL_MOTOR_COUNT);
  Serial.print("Target period us: "); Serial.println(DL_PERIOD_US);
  Serial.print("Max controller compute us: "); Serial.println(max_compute_us);
  Serial.print("Deadline misses: "); Serial.println(deadline_misses);
  Serial.print("Integration ready: "); Serial.println(integration_started && dl_hw_ready());
  Serial.print("Fault latched: "); Serial.println(fault_latched);
  Serial.println("Export is a bench/porting project; hardware flight not validated.");
}
static void benchmark_controller() {
  if (dl_hw_armed()) return;
  DL_Controller test; DL_Output result;
  const DL_State state={{.1,-.2,2},{.1,.2,-.1},{1,0,0,0},{.03,-.02,.01}};
  const DL_Target target={{1,1,5},{0,0,0},{0,0,0},.1};
  dl_reset(&test); uint32_t worst=0; bool ok=true; double checksum=0;
  for(unsigned i=0;i<32;i++) {
    const uint32_t begin=micros();
    ok=dl_step(&test,&DL_DEFAULT,&state,&target,1.0/DL_CONTROL_HZ,true,&result) && ok;
    const uint32_t elapsed=(uint32_t)(micros()-begin);
    if(elapsed>worst)worst=elapsed;
    checksum+=result.motor_N[i%DL_MOTOR_COUNT];
  }
  Serial.print("Controller benchmark worst us: "); Serial.println(worst);
  Serial.print("Computation valid: "); Serial.println(ok);
  Serial.print("Checksum: "); Serial.println(checksum,6);
  Serial.println(worst<DL_PERIOD_US ? "Controller fits nominal slot; FULL loop still unmeasured." : "Controller exceeds slot: reduce scope or choose another MCU.");
  stop_outputs(); last_tick=micros();
}
void setup() {
  Serial.begin(115200);  // No while(!Serial): USB must not block scheduling.
  dl_reset(&controller); integration_started=dl_hw_begin();
  stop_outputs(); last_tick=micros();
}
void loop() {
  // Serial diagnostics are only processed while disarmed.
  if(!dl_hw_armed() && Serial.available()) {
    const int command=Serial.read();
    if(command=='b')benchmark_controller();
    if(command=='i')show_status();
    if(command=='r'){fault_latched=false;stop_outputs();last_tick=micros();}
  }
  const uint32_t now=micros(), elapsed=(uint32_t)(now-last_tick);
  if(elapsed<DL_PERIOD_US)return;
  last_tick=now; // Never attempt a burst of catch-up motor commands.
  if(elapsed>2*DL_PERIOD_US){deadline_misses++;fault_latched=true;}
#if DL_ACTUATORS_ENABLED && !DL_LIMITED_PROFILE
  if(fault_latched || !integration_started || !dl_hw_ready() || !dl_hw_armed()) {stop_outputs();return;}
  DL_State state; DL_Target target; uint32_t sample_us=0;
  if(!dl_hw_read_state(&state,&sample_us) || !dl_hw_read_target(&target) ||
     (uint32_t)(now-sample_us)>DL_STATE_MAX_AGE_US){fault_latched=true;stop_outputs();return;}
  const uint32_t begin=micros();
  const bool ok=dl_step(&controller,&DL_DEFAULT,&state,&target,elapsed/1000000.0,true,&output);
  const uint32_t compute_us=(uint32_t)(micros()-begin);
  if(compute_us>max_compute_us)max_compute_us=compute_us;
  if(!ok || (uint32_t)(micros()-now)>=DL_PERIOD_US){deadline_misses++;fault_latched=true;stop_outputs();return;}
  dl_hw_write_motor_newtons(output.motor_N, DL_MOTOR_COUNT);
#else
  stop_outputs(); // Shipped state: no pins configured, no ESC signal emitted.
#endif
}
`;

export function arduinoFiles(template,sim,board){
  validateBoard(board);
  const slug=board.id.replace(/[^A-Za-z0-9_]/g,'_').slice(0,55),folder=`DroneLab_${slug}`,base=folder+'/';
  const applied=configuration(sim);
  const boardHeader=`#pragma once\n// Selection does not certify a real-aircraft installation.\n#define DL_BOARD_NAME ${JSON.stringify(board.name)}\n#define DL_BOARD_FQBN ${JSON.stringify(board.fqbn)}\n#define DL_AIRFRAME_NAME ${JSON.stringify(applied.geometry.airframe)}\n#define DL_MOTOR_COUNT ${applied.geometry.motor_count}\n#define DL_CONTROL_HZ 240UL\n#define DL_PERIOD_US ((1000000UL + DL_CONTROL_HZ/2) / DL_CONTROL_HZ)\n#define DL_STATE_MAX_AGE_US 20000UL\n#define DL_LIMITED_PROFILE ${board.limited?1:0}\n#define DL_ACTUATORS_ENABLED 0\n`;
  const manifest={format:'dronelab-arduino-project',version:2,board,configuration:applied,scope:board.limited?'controller benchmark only; reduced stabilization requires separate development':'portable controller and integration scaffold; no hardware validation',actuators_enabled:false,controller_precision:'double (size is target dependent)',validation:{flight:false,sensors:false,esc:false,compile:(board.validation?.airframes||[]).includes(sim.c.airframe)?board.validation:null},remaining:['Real sensor drivers and calibration','State estimator and coordinate conversions','Receiver, mission and flight supervisor','Thrust mapping and timed ESC output','Full loop timing and hardware tests']};
  const index=board.indexUrl?`\nAdditional board manager URL (for third-party cores):\n${board.indexUrl}\n`:'';
  const readme=`# DroneLab — ${board.name}\n\n## What this archive contains\n\nArduino IDE project with the applied simulation gains, controller, target profile and inactive hardware adapter. It can be compiled and uploaded as a BENCH program. It is NOT a complete flight firmware. No GPIO or motor output is configured by default.\n\n## Upload\n\n1. Extract the ZIP. Open ${folder}.ino inside its same-named folder.\n2. Install board package ${board.core}, choose the exact board and USB port.\n3. Compile and upload with Arduino IDE. Serial monitor: 115200 baud.\n4. Send i for status, b for a 32-step controller benchmark. No command arms the board.\n\nArduino CLI equivalent (install CLI separately):\n\n\x60\x60\x60sh\narduino-cli core install ${board.core}${board.indexUrl?' --additional-urls '+board.indexUrl:''}\narduino-cli compile --fqbn ${board.fqbn} ${folder}\narduino-cli upload --fqbn ${board.fqbn} --port YOUR_PORT ${folder}\n\x60\x60\x60\n${index}\n## Target profile\n\n${board.notes}\n${board.limited?'This 8-bit profile is restricted to benchmarking. A reduced stabilization controller needs separate development; no autonomous-flight capability is asserted.':'The full-loop rate of 240 Hz is a target, not a measured guarantee. Sensors, ESC protocols, interrupt load and radio tasks alter the timing budget.'}\n\nCompilation status for this geometry: ${manifest.validation.compile?JSON.stringify(manifest.validation.compile):'Not verified with this exact board/core.'}\nHardware flight: NOT VALIDATED. A successful compile does not verify wiring, sensors or flight behavior.\n\n## Hardware integration\n\nImplement dl_hal.h with your calibrated sensor drivers, estimator, timestamped state, mission/receiver supervisor and calibrated motor driver. ENU/FLU, SI units, Hamilton [w,x,y,z]. Convert explicitly if hardware uses NED/FRD. The ${applied.geometry.motor_count} active outputs are NEWTONS, not PWM duty cycle. Motor positions and reaction-torque signs are in manifest.json.\n\nDL_ACTUATORS_ENABLED is shipped as 0. The adapter also returns false for ready/armed/state/target. Keep outputs inactive during porting. A controller benchmark measures only computation; validate the complete loop, kill mechanism and sensor/ESC timeouts separately. Reset faults only while disarmed.\n\nThe actuator adapter must handle zero-thrust / disarmed / error conditions itself and provide an independent hardware timeout. A complete autopilot, failsafe policy and hardware-specific pin mapping must be supplied before flight testing.\n\n## Source\n\n${board.source||'Custom profile: verify against your board manufacturer.'}\nhttps://docs.arduino.cc/software/ide-v2/tutorials/getting-started/ide-v2-uploading-a-sketch/\n`;
  return [{name:base+folder+'.ino',content:SKETCH},{name:base+'dl_controller.h',content:'#pragma once\n'+generateC(template,sim.c)},{name:base+'dl_board.h',content:boardHeader},{name:base+'dl_hal.h',content:HAL},{name:base+'manifest.json',content:JSON.stringify(manifest,null,2)},{name:base+'simulation-config.json',content:JSON.stringify(configuration(sim),null,2)},{name:base+'README.md',content:readme}];
}
export function arduinoZip(template,sim,board){return zipStore(arduinoFiles(template,sim,board));}
