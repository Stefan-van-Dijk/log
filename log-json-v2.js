(()=>{
'use strict';

const SCHEMA_URL='https://stefan-van-dijk.github.io/log/schemas/log-v2.schema.json';

function clone(value){return value==null?value:JSON.parse(JSON.stringify(value))}
function present(value){
  return value!==undefined&&value!==''&&!(Array.isArray(value)&&value.length===0);
}
function clean(value){
  if(Array.isArray(value)){
    const items=value.map(clean).filter(item=>item!==undefined);
    return items.length?items:undefined;
  }
  if(value&&typeof value==='object'){
    const result={};
    for(const [key,item] of Object.entries(value)){
      const cleaned=clean(item);
      if(present(cleaned))result[key]=cleaned;
    }
    return Object.keys(result).length?result:undefined;
  }
  return present(value)?value:undefined;
}
function object(value){return clean(value)||{}}
function array(value){return Array.isArray(value)?value.map(clean).filter(item=>item!==undefined):[]}
function hash(value){
  let result=2166136261;
  for(const char of String(value)){result^=char.codePointAt(0);result=Math.imul(result,16777619)}
  return(result>>>0).toString(36);
}
function sourceId(item,fallback){return String(item?.id||`legacy-${hash(fallback)}`)}

function locationEntity(card){
  const p=card.props||{};
  const coordinates=p.latitude==null&&p.longitude==null?null:object({latitude:p.latitude,longitude:p.longitude});
  return object({
    id:card.id,
    type:'location',
    name:p.name||card.title,
    address:p.address||undefined,
    coordinates,
    category:p.location_type||undefined,
    share_ride:p.share_ride||undefined,
    parent_id:card.parents?.[0],
    contexts:card.contexts,
    created_at:p.created_at||undefined,
    updated_at:p.updated_at||undefined
  });
}

function taskEntity(card){
  const p=card.props||{};
  return object({
    id:card.id,
    type:'task',
    task_type:p.task_kind,
    name:card.title,
    parent_id:card.parents?.[0],
    usage_count:p.usage_count,
    contexts:card.contexts,
    created_at:p.created_at||undefined
  });
}

function activityEntity(card){
  const p=card.props||{},activityType=p.registration_type;
  const base={
    id:card.id,
    type:'activity',
    activity_type:activityType,
    status:p.status||'completed',
    title:card.title,
    contexts:card.contexts,
    parent_activity_id:p.parent_registration_id||undefined,
    created_at:p.created_at||undefined,
    updated_at:p.updated_at||undefined
  };
  if(activityType==='trip'){
    return object({...base,
      started_at:p.departure_time??null,
      ended_at:p.arrival_time??null,
      category:p.category||undefined,
      reason:p.reason||undefined,
      route:{
        origin_id:p.origin_id||undefined,
        destination_id:p.destination_id||undefined,
        planned_destination:p.planned_destination||undefined,
        proposal_km:p.proposed_route_km,
        proposal_source:p.route_source||undefined
      },
      odometer:{start_km:p.start_odometer??null,end_km:p.end_odometer??null},
      distance:{
        total_km:p.distance_km??null,
        business_km:p.business_km,
        commute_km:p.commute_km,
        private_km:p.private_km
      },
      track_point_count:Array.isArray(p.gps_points)?p.gps_points.length:0
    });
  }
  if(activityType==='trip_event'){
    return object({...base,
      event_type:p.event_type,
      occurred_at:p.time??null,
      odometer_km:p.odometer??null,
      location_id:p.location_id||undefined,
      note:p.note||undefined,
      historical_time_unknown:p.historical_time_unknown===true||undefined
    });
  }
  if(activityType==='time'){
    return object({...base,
      activity_kind:p.kind||undefined,
      date:p.date||undefined,
      started_at:p.start_time??null,
      ended_at:p.end_time??p.stop_time??null,
      task_id:p.task_id||undefined,
      subtask_id:p.subtask_id||undefined,
      location_id:p.location_id||undefined,
      department:p.department_name||undefined,
      note:p.note||undefined,
      duration:{
        actual_minutes:p.actual_minutes,
        net_minutes:p.net_actual_minutes,
        rounded_minutes:p.rounded_minutes,
        deducted_interruption_minutes:p.deducted_interruption_minutes,
        deduct_minutes:p.deduct_minutes,
        own_minutes:p.own_minutes,
        colleague_minutes:p.colleague_minutes,
        total_minutes:p.total_minutes
      },
      people:p.people,
      allocations:p.allocations,
      attributions:p.attributions,
      entry_contexts:p.entry_contexts,
      rounding:p.rounding_snapshot,
      interruption:p.interruption
    });
  }
  return object(base);
}

function personEntity(person){
  return object({
    id:`person:time:${sourceId(person,person?.name)}`,
    type:'person',
    name:person?.name,
    usage_count:Number(person?.usageCount||0),
    created_at:person?.createdAt||undefined
  });
}

function departmentEntity(department,index){
  if(typeof department==='string')return{id:`department:${hash(department)}`,type:'department',name:department};
  return object({
    id:`department:${sourceId(department,department?.name||index)}`,
    type:'department',
    name:department?.name,
    created_at:department?.createdAt||undefined
  });
}

function trackPointEntity(point,km){
  const active=km.activeTrip?.id&&km.activeTrip.id===point.tripId;
  return object({
    id:`track-point:${sourceId(point,`${point.tripId}|${point.time}|${point.lat}|${point.lng}`)}`,
    type:'track_point',
    activity_id:point.tripId?`registration:km${active?'-active':''}:${point.tripId}`:undefined,
    recorded_at:point.time??null,
    coordinates:{latitude:point.lat,longitude:point.lng},
    accuracy_m:point.accuracy??null
  });
}

function relationshipEntity(edge){
  return object({
    id:edge.id,
    type:'relationship',
    relationship_type:edge.predicate,
    from_id:edge.subject,
    to_id:edge.object,
    contexts:edge.contexts
  });
}

function build({appBuild,km,time,model,identities,storageKeys}){
  const locations=model.cards.filter(card=>card.card_type==='location').map(locationEntity);
  const tasks=model.cards.filter(card=>card.card_type==='task').map(taskEntity);
  const activities=model.cards.filter(card=>card.card_type==='registration').map(activityEntity);
  const people=array(time.colleagues).map(personEntity);
  const departments=array(time.departments).map(departmentEntity);
  const relationships=model.edges.map(relationshipEntity);
  const trackPoints=array(km.trackPoints).map(point=>trackPointEntity(point,km));
  const activeIds=activities.filter(activity=>activity.status==='active').map(activity=>activity.id);
  const generatedAt=new Date().toISOString();

  return{
    '$schema':SCHEMA_URL,
    schema:'log.v2',
    schema_version:2,
    export_kind:'complete_backup',
    generated_at:generatedAt,
    app:{name:'Log',build:appBuild},
    counts:{
      locations:locations.length,
      tasks:tasks.length,
      people:people.length,
      departments:departments.length,
      activities:activities.length,
      relationships:relationships.length,
      track_points:trackPoints.length,
      trips:Array.isArray(km.trips)?km.trips.length:0,
      time_entries:Array.isArray(time.entries)?time.entries.length:0
    },
    data:{
      settings:object({mobility:clone(km.settings),time:clone(time.settings)}),
      catalog:{locations,tasks,people,departments},
      activities,
      relationships,
      track_points:trackPoints,
      state:{
        active_activity_ids:activeIds,
        last_endpoint:clean(clone(km.lastEndpoint)),
        last_completion:clean(clone(km.lastCompletion||time.lastCompletion))
      }
    },
    recovery:{
      format:'log.internal.v1',
      sources:{
        kilometerregistratie:{storage_key:storageKeys.kilometers,present:true,data:clone(km)},
        tijdsregistratie:{storage_key:storageKeys.time,present:storageKeys.timePresent,data:clone(time)},
        identiteiten:{storage_key:storageKeys.identities,present:storageKeys.identitiesPresent,data:clone(identities)}
      }
    }
  };
}

window.LogJsonV2={build,clean};
})();