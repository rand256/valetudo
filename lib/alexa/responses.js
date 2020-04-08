const { eventServiceFile, metaInfoFile } = require("./const");

const deviceType = "urn:Belkin:device:controllee:1";

const descriptionXML = (name, namespace, uuid, state) => `<?xml version="1.0"?>
<root xmlns="urn:Belkin:device-1-0">
<device>
	<deviceType>${deviceType}</deviceType>
	<friendlyName>${name}${
	namespace && namespace !== "primary" ? ` ${namespace}` : ""
}</friendlyName>
	<manufacturer>Belkin International Inc.</manufacturer>
	<modelName>Socket</modelName>
	<modelNumber>3.1415</modelNumber>
	<UDN>uuid:Socket-1_0-${namespace.replace(/ /g, "-")}-${uuid}</UDN>
	<binaryState>${state}</binaryState>
	<serviceList>
		<service>
			<serviceType>urn:Belkin:service:basicevent:1</serviceType>
			<serviceId>urn:Belkin:serviceId:basicevent1</serviceId>
			<controlURL>/upnp/control/basicevent1</controlURL>
			<eventSubURL>/upnp/event/basicevent1</eventSubURL>
			<SCPDURL>/${eventServiceFile}</SCPDURL>
		  </service>
		<service>
			<serviceType>urn:Belkin:service:metainfo:1</serviceType>
			<serviceId>urn:Belkin:serviceId:metainfo1</serviceId>
			<controlURL>/upnp/control/metainfo1</controlURL>
			<eventSubURL>/upnp/event/metainfo1</eventSubURL>
			<SCPDURL>/${metaInfoFile}</SCPDURL>
		  </service>
	</serviceList>
</device>
</root>
`;

const eventInfo = () => `<?xml version="1.0"?>
<scpd xmlns="urn:Belkin:service-1-0">
<actionList>
  <action>
    <name>SetBinaryState</name>
    <argumentList>
      <argument>
        <retval/>
        <name>BinaryState</name>
        <relatedStateVariable>BinaryState</relatedStateVariable>
        <direction>in</direction>
      </argument>
    </argumentList>
  </action>
  <action>
    <name>GetBinaryState</name>
    <argumentList>
      <argument>
        <retval/>
        <name>BinaryState</name>
        <relatedStateVariable>BinaryState</relatedStateVariable>
        <direction>out</direction>
      </argument>
    </argumentList>
  </action>
</actionList>
<serviceStateTable>
  <stateVariable sendEvents="yes">
    <name>BinaryState</name>
    <dataType>bool</dataType>
    <defaultValue>0</defaultValue>
  </stateVariable>
  <stateVariable sendEvents="yes">
    <name>level</name>
    <dataType>string</dataType>
    <defaultValue>0</defaultValue>
  </stateVariable>
</serviceStateTable>
</scpd>
`;

const metaInfo = () => `<?xml version="1.0"?>
<scpd xmlns="urn:Belkin:service-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <actionList>
    <action>
      <name>GetMetaInfo</name>
      <argumentList>
        <retval />
        <name>GetMetaInfo</name>
        <relatedStateVariable>MetaInfo</relatedStateVariable>
        <direction>in</direction>
      </argumentList>
    </action>
  </actionList>
  <serviceStateTable>
    <stateVariable sendEvents="yes">
      <name>MetaInfo</name>
      <dataType>string</dataType>
      <defaultValue>0</defaultValue>
    </stateVariable>
  </serviceStateTable>
</scpd>
`;

const binaryStateResponse = (
	action,
	value
) => `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
	<s:Body>
		<u:${action}Response xmlns:u="urn:Belkin:service:basicevent:1">
			<BinaryState>${value}</BinaryState>
		</u:${action}Response>
	</s:Body>
</s:Envelope>
`;

module.exports = {
	descriptionXML,
	binaryStateResponse,
	metaInfo,
	eventInfo,
};
